import { badRequest, notFound } from "@/api/lib/errors";
import { serializeDoc, serializeDocs } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { objectIdSchema } from "@/schemas/common";
import {
  createTodoListSchema,
  updateTodoListSchema,
  type TodoTask,
} from "@/schemas/todo";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { MongoServerError, ObjectId } from "mongodb";

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

export const todoListsRoutes = new Hono<{ Variables: SessionVariables }>();

todoListsRoutes.use("*", sessionAuth);

function validateTasks(tasks: TodoTask[]) {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) badRequest(`Duplicate task id: ${task.id}`);
    ids.add(task.id);
  }
}

async function findOwnedList(userAddress: string, listId: string) {
  const { todoLists } = getCollections(getDb());
  return todoLists.findOne({
    _id: new ObjectId(listId),
    userAddress,
  });
}

todoListsRoutes.get("/", async (c) => {
  const walletAddress = c.get("walletAddress");
  const { todoLists } = getCollections(getDb());
  const docs = await todoLists.find({ userAddress: walletAddress }).sort({ createdAt: 1 }).toArray();
  return c.json({ todoLists: serializeDocs(docs) });
});

todoListsRoutes.get("/:id", async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("List not found");

  const doc = await findOwnedList(walletAddress, id.data);
  if (!doc) notFound("List not found");

  return c.json({ todoList: serializeDoc(doc) });
});

todoListsRoutes.post("/", zValidator("json", createTodoListSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const body = c.req.valid("json");
  const { todoLists } = getCollections(getDb());
  const now = new Date();

  /* The unique { userAddress, name } index is the source of truth; a pre-check
     alone races with concurrent creates and would surface as a 500. */
  let result;
  try {
    result = await todoLists.insertOne({
      userAddress: walletAddress,
      name: body.name,
      icon: body.icon,
      tasks: [],
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) badRequest("A list with this name already exists");
    throw err;
  }

  const doc = await todoLists.findOne({ _id: result.insertedId });
  if (!doc) notFound("List not found");

  return c.json({ todoList: serializeDoc(doc) }, 201);
});

todoListsRoutes.patch("/:id", zValidator("json", updateTodoListSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("List not found");

  const body = c.req.valid("json");
  if (body.tasks) validateTasks(body.tasks);

  const { todoLists } = getCollections(getDb());

  let updated;
  try {
    updated = await todoLists.findOneAndUpdate(
      { _id: new ObjectId(id.data), userAddress: walletAddress },
      { $set: { ...body, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  } catch (err) {
    if (isDuplicateKeyError(err)) badRequest("A list with this name already exists");
    throw err;
  }

  if (!updated) notFound("List not found");
  return c.json({ todoList: serializeDoc(updated) });
});

todoListsRoutes.delete("/:id", async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("List not found");

  const { todoLists } = getCollections(getDb());
  const result = await todoLists.deleteOne({
    _id: new ObjectId(id.data),
    userAddress: walletAddress,
  });

  if (result.deletedCount === 0) notFound("List not found");
  return c.json({ ok: true });
});
