import { ObjectId, type Db } from "mongodb";
import { COLLECTIONS, setDbForTests } from "@/db";

type Doc = Record<string, unknown> & { _id: ObjectId };

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if (key === "$or") {
      const clauses = value as Record<string, unknown>[];
      if (!clauses.some((clause) => matches(doc, clause))) return false;
      continue;
    }
    if (key === "_id") {
      if (value && typeof value === "object" && !(value instanceof ObjectId) && !(value instanceof Date) && !Array.isArray(value)) {
        const ops = value as Record<string, unknown>;
        if ("$ne" in ops) {
          const right = ops.$ne;
          if (right instanceof ObjectId && doc._id.equals(right)) return false;
          continue;
        }
      }
      const id = value instanceof ObjectId ? value.toHexString() : String(value);
      if (doc._id.toHexString() !== id) return false;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof ObjectId)) {
      const ops = value as Record<string, unknown>;
      if ("$exists" in ops) {
        const exists = doc[key] !== undefined;
        if (Boolean(ops.$exists) !== exists) return false;
        continue;
      }
      if ("$gt" in ops) {
        const left = doc[key];
        const right = ops.$gt;
        if (!(left instanceof Date && right instanceof Date && left.getTime() > right.getTime())) {
          if (!(typeof left === "number" && typeof right === "number" && left > right)) return false;
        }
        continue;
      }
      if ("$ne" in ops) {
        const right = ops.$ne;
        if (right instanceof ObjectId) {
          if (doc[key] instanceof ObjectId && (doc[key] as ObjectId).equals(right)) return false;
        } else if (doc[key] === right) {
          return false;
        }
        continue;
      }
      if ("$in" in ops) {
        const list = ops.$in as unknown[];
        if (!list.includes(doc[key])) return false;
        continue;
      }
    }
    if (doc[key] !== value) return false;
  }
  return true;
}

function applyUpdate(doc: Doc, update: Record<string, unknown>): void {
  if (update.$set && typeof update.$set === "object") {
    Object.assign(doc, update.$set);
  }
  if (update.$setOnInsert && typeof update.$setOnInsert === "object") {
    /* only applied on insert by findOneAndUpdate path */
  }
  for (const [k, v] of Object.entries(update)) {
    if (!k.startsWith("$")) doc[k] = v;
  }
}

function createCollection() {
  const docs: Doc[] = [];

  return {
    async insertOne(doc: Record<string, unknown>) {
      const _id = (doc._id as ObjectId) ?? new ObjectId();
      const stored = { ...doc, _id } as Doc;
      docs.push(stored);
      return { insertedId: _id, acknowledged: true };
    },
    async findOne(filter: Record<string, unknown>) {
      return docs.find((d) => matches(d, filter)) ?? null;
    },
    async findOneAndUpdate(
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: { upsert?: boolean; returnDocument?: "before" | "after" },
    ) {
      let doc = docs.find((d) => matches(d, filter));
      if (!doc && options?.upsert) {
        const _id = new ObjectId();
        doc = { _id } as Doc;
        if (update.$setOnInsert && typeof update.$setOnInsert === "object") {
          Object.assign(doc, update.$setOnInsert);
        }
        if (update.$set && typeof update.$set === "object") {
          Object.assign(doc, update.$set);
        }
        /* Merge equality filter fields onto inserted doc (Mongo upsert behavior). */
        for (const [k, v] of Object.entries(filter)) {
          if (!k.startsWith("$") && doc[k] === undefined) doc[k] = v as never;
        }
        docs.push(doc);
        return options?.returnDocument === "before" ? null : { ...doc };
      }
      if (!doc) return null;
      const before = { ...doc };
      applyUpdate(doc, update);
      return options?.returnDocument === "before" ? before : { ...doc };
    },
    async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return { matchedCount: 0, modifiedCount: 0, acknowledged: true };
      applyUpdate(doc, update);
      return { matchedCount: 1, modifiedCount: 1, acknowledged: true };
    },
    async updateMany(filter: Record<string, unknown>, update: Record<string, unknown>) {
      let matched = 0;
      for (const doc of docs) {
        if (!matches(doc, filter)) continue;
        applyUpdate(doc, update);
        matched++;
      }
      return { matchedCount: matched, modifiedCount: matched, acknowledged: true };
    },
    find(filter: Record<string, unknown> = {}) {
      const matched = docs.filter((d) => matches(d, filter));
      const state = { docs: matched, sortKey: null as string | null, sortDir: 1 };
      const api = {
        sort(spec: Record<string, 1 | -1>) {
          const [key, dir] = Object.entries(spec)[0] ?? [];
          state.sortKey = key ?? null;
          state.sortDir = dir ?? 1;
          return api;
        },
        async toArray() {
          const out = [...state.docs];
          if (state.sortKey) {
            const key = state.sortKey;
            const dir = state.sortDir;
            out.sort((a, b) => {
              const av = a[key];
              const bv = b[key];
              if (av instanceof Date && bv instanceof Date) {
                return (av.getTime() - bv.getTime()) * dir;
              }
              return String(av).localeCompare(String(bv)) * dir;
            });
          }
          return out;
        },
      };
      return api;
    },
    async deleteMany() {
      const n = docs.length;
      docs.length = 0;
      return { deletedCount: n };
    },
    _docs: docs,
  };
}

export type MemoryDb = {
  collection: (name: string) => ReturnType<typeof createCollection>;
  _reset: () => void;
};

export function createMemoryDb(): MemoryDb {
  const collections = new Map<string, ReturnType<typeof createCollection>>();

  const db = {
    collection(name: string) {
      let col = collections.get(name);
      if (!col) {
        col = createCollection();
        collections.set(name, col);
      }
      return col;
    },
    _reset() {
      for (const name of Object.values(COLLECTIONS)) {
        collections.get(name)?.deleteMany();
      }
      collections.clear();
    },
  };

  return db;
}

export function installMemoryDb(): MemoryDb {
  const db = createMemoryDb();
  setDbForTests(db as unknown as Db);
  return db;
}

export function uninstallMemoryDb(): void {
  setDbForTests(null);
}
