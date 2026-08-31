import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { COLLECTIONS } from "@/db";
import { randomObjectId } from "@/api/lib/ids";
import type { EventDocument } from "@/db/collections";
import { ObjectId } from "mongodb";
import { installEmailMock } from "../helpers/email-mock";
import { installMemoryDb, uninstallMemoryDb, type MemoryDb } from "../helpers/memory-db";

const ACCOUNT_ID = "64b64c4f2f1c2e0012345678";

installEmailMock({
  emailConfigured: () => false,
});

/** Build a minimal notify event row. */
function notifyEvent(partial: Partial<EventDocument> = {}): EventDocument {
  return {
    _id: randomObjectId(),
    accountId: ACCOUNT_ID,
    catId: "bill",
    date: "2026-12-01",
    allDay: true,
    time: null,
    repeat: "once",
    lead: "1d",
    notify: true,
    enc: 1,
    payload: "enc",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as EventDocument;
}

describe("cron scan pagination", () => {
  let memory: MemoryDb;
  let processDueReminders: (now?: Date) => Promise<{ scanned: number; truncated?: boolean }>;

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    memory = installMemoryDb();
    ({ processDueReminders } = await import("@/api/lib/reminders"));
  });

  afterAll(() => {
    uninstallMemoryDb();
  });

  beforeEach(async () => {
    memory._reset();
    await memory.collection(COLLECTIONS.users).insertOne({
      _id: new ObjectId(ACCOUNT_ID),
      address: "0xabc",
      notifyEmail: "user@example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await memory.collection(COLLECTIONS.pushSubscriptions).insertOne({
      _id: new ObjectId(),
      accountId: ACCOUNT_ID,
      endpoint: "https://fcm.googleapis.com/fcm/send/x",
      keys: { p256dh: "a", auth: "b" },
      createdAt: new Date(),
      lastSeenAt: new Date(),
    });
  });

  test("scans every notify event across batches in one run", async () => {
    const rows = Array.from({ length: 120 }, () => notifyEvent());
    await memory.collection(COLLECTIONS.events).insertMany(rows);

    const result = await processDueReminders(new Date("2026-01-01"));

    expect(result.scanned).toBe(120);
    const scanned = await memory
      .collection(COLLECTIONS.events)
      .find({ notify: true, lastScannedAt: { $exists: true } })
      .toArray();
    expect(scanned.length).toBe(120);
  });
});
