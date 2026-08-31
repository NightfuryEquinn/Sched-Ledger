import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { COLLECTIONS } from "@/db";
import type { EventDocument, ReminderChannel } from "@/db/collections";
import { zonedLocalToUtcMs } from "@/lib/timezone";
import { ObjectId } from "mongodb";
import { installMemoryDb, uninstallMemoryDb, type MemoryDb } from "../helpers/memory-db";

/*
 * Email and Web Push are independent channels sharing one reminder_logs row.
 * These cover the per-channel dedupe: what has already gone out must not repeat,
 * and what has not must still send — including for events with no email address.
 */

const TZ = "Asia/Kuala_Lumpur";
const DAY = "2026-08-10";
const ACCOUNT_ID = "64b64c4f2f1c2e0012345678";

/** Recipients captured per run instead of hitting Resend. */
const emailSends: string[] = [];
/** Endpoints captured per run instead of hitting a push service. */
const pushSends: string[] = [];
/** Status the fake push service raises, if any (410 = endpoint gone). */
let pushFailStatus: number | null = null;

mock.module("@/api/lib/email", () => ({
  emailConfigured: () => Boolean(process.env.RESEND_API_KEY),
  sendEmail: async (input: { to: string }) => {
    emailSends.push(input.to);

    return { ok: true, id: "test" };
  },
  reminderEmailHtml: () => ({ html: "<p/>", text: "reminder", subject: "Upcoming" }),
}));

mock.module("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }) => {
      if (pushFailStatus !== null) {
        throw Object.assign(new Error(`push ${pushFailStatus}`), { statusCode: pushFailStatus });
      }
      pushSends.push(sub.endpoint);
    },
  },
}));

/** An all-day event whose day-of reminder lands at 09:00 local. */
function eventDoc(partial: Partial<EventDocument> = {}): EventDocument {
  return {
    _id: new ObjectId(),
    accountId: ACCOUNT_ID,
    catId: "bill",
    date: DAY,
    allDay: true,
    time: null,
    repeat: "once",
    lead: "at",
    notify: true,
    email: "user@example.com",
    notifyDetails: { title: "Rent" },
    enc: 1,
    payload: "enc",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as EventDocument;
}

describe("reminder channel dedupe", () => {
  let memory: MemoryDb;
  let processDueReminders: (now?: Date) => Promise<{
    sent: number;
    skipped: number;
    errors: string[];
  }>;
  /** The 09:00-local instant the day-of reminder is due. */
  const now = new Date(zonedLocalToUtcMs(DAY, "09:00", TZ));

  beforeAll(async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    memory = installMemoryDb();
    /* Imported after the mocks so the stubbed senders are the ones wired in. */
    ({ processDueReminders } = await import("@/api/lib/reminders"));
  });

  afterAll(() => {
    uninstallMemoryDb();
  });

  beforeEach(async () => {
    memory._reset();
    emailSends.length = 0;
    pushSends.length = 0;
    pushFailStatus = null;

    await memory.collection(COLLECTIONS.users).insertOne({
      _id: new ObjectId(ACCOUNT_ID),
      address: "0xabc",
      codename: "tester",
      notifyEmail: "user@example.com",
      timezone: TZ,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  /** Register a push endpoint for the test account. */
  async function addPushSubscription(endpoint = "https://push.example/abc") {
    await memory.collection(COLLECTIONS.pushSubscriptions).insertOne({
      _id: new ObjectId(),
      accountId: ACCOUNT_ID,
      endpoint,
      keys: { p256dh: "p", auth: "a" },
      createdAt: new Date(),
      lastSeenAt: new Date(),
    });
  }

  /** Pre-seed the log row for an event's day-of reminder. */
  async function addLog(eventId: ObjectId, channels?: ReminderChannel[]) {
    await memory.collection(COLLECTIONS.reminderLogs).insertOne({
      _id: new ObjectId(),
      accountId: ACCOUNT_ID,
      eventId,
      occurrenceIso: DAY,
      lead: "at",
      email: "user@example.com",
      ...(channels ? { channels } : {}),
      sentAt: new Date(),
    });
  }

  test("sends both channels and records them on a fresh reminder", async () => {
    const ev = eventDoc();
    await memory.collection(COLLECTIONS.events).insertOne(ev);
    await addPushSubscription();

    const result = await processDueReminders(now);

    expect(result.sent).toBe(1);
    expect(emailSends).toEqual(["user@example.com"]);
    expect(pushSends).toEqual(["https://push.example/abc"]);

    const log = await memory.collection(COLLECTIONS.reminderLogs).findOne({ eventId: ev._id });
    expect((log?.channels as ReminderChannel[]).sort()).toEqual(["email", "push"]);
  });

  test("a log row with no channels counts as email-sent, so only push goes out", async () => {
    const ev = eventDoc();
    await memory.collection(COLLECTIONS.events).insertOne(ev);
    await addPushSubscription();
    /* Rows written before Web Push existed have no `channels` field. */
    await addLog(ev._id);

    const result = await processDueReminders(now);

    expect(emailSends).toEqual([]);
    expect(pushSends).toEqual(["https://push.example/abc"]);
    expect(result.sent).toBe(1);

    /* The implicit email must be materialized, or the next poll re-sends it. */
    const log = await memory.collection(COLLECTIONS.reminderLogs).findOne({ eventId: ev._id });
    expect((log?.channels as ReminderChannel[]).sort()).toEqual(["email", "push"]);

    const second = await processDueReminders(now);
    expect(emailSends).toEqual([]);
    expect(pushSends).toHaveLength(1);
    expect(second.sent).toBe(0);
  });

  test("an already-emailed reminder still pushes", async () => {
    const ev = eventDoc();
    await memory.collection(COLLECTIONS.events).insertOne(ev);
    await addPushSubscription();
    await addLog(ev._id, ["email"]);

    await processDueReminders(now);

    expect(emailSends).toEqual([]);
    expect(pushSends).toEqual(["https://push.example/abc"]);
  });

  test("a reminder logged on both channels is skipped entirely", async () => {
    const ev = eventDoc();
    await memory.collection(COLLECTIONS.events).insertOne(ev);
    await addPushSubscription();
    await addLog(ev._id, ["email", "push"]);

    const result = await processDueReminders(now);

    expect(emailSends).toEqual([]);
    expect(pushSends).toEqual([]);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test("an event with no per-event email still uses the account notify address", async () => {
    const ev = eventDoc({ email: "" });
    await memory.collection(COLLECTIONS.events).insertOne(ev);
    await addPushSubscription();

    const result = await processDueReminders(now);

    expect(emailSends).toEqual(["user@example.com"]);
    expect(pushSends).toEqual(["https://push.example/abc"]);
    expect(result.sent).toBe(1);

    const log = await memory.collection(COLLECTIONS.reminderLogs).findOne({ eventId: ev._id });
    expect((log?.channels as string[] | undefined)?.sort()).toEqual(["email", "push"]);
  });

  test("an event with no push subscription still emails the account address", async () => {
    await memory.collection(COLLECTIONS.events).insertOne(eventDoc({ email: "" }));

    const result = await processDueReminders(now);

    expect(emailSends).toEqual(["user@example.com"]);
    expect(pushSends).toEqual([]);
    expect(result.sent).toBe(1);
  });

  test("a 410 from the push service prunes the dead subscription", async () => {
    await memory.collection(COLLECTIONS.events).insertOne(eventDoc());
    await addPushSubscription();
    pushFailStatus = 410;

    const result = await processDueReminders(now);

    /* Email still succeeded, so the reminder counts as sent... */
    expect(result.sent).toBe(1);
    const log = await memory.collection(COLLECTIONS.reminderLogs).findOne({});
    expect(log?.channels).toEqual(["email"]);
    /* ...but the dead endpoint must not linger. */
    const left = await memory.collection(COLLECTIONS.pushSubscriptions).find({}).toArray();
    expect(left).toHaveLength(0);
  });

  test("a failing push does not stop the email", async () => {
    await memory.collection(COLLECTIONS.events).insertOne(eventDoc());
    await addPushSubscription();
    pushFailStatus = 500;

    const result = await processDueReminders(now);

    expect(emailSends).toEqual(["user@example.com"]);
    expect(result.sent).toBe(1);
    /* Push is absent from the log, so the next poll retries it. */
    const log = await memory.collection(COLLECTIONS.reminderLogs).findOne({});
    expect(log?.channels).toEqual(["email"]);
  });

  test("the global email opt-out does not silence push", async () => {
    await memory.collection(COLLECTIONS.users).deleteMany({});
    await memory.collection(COLLECTIONS.users).insertOne({
      _id: new ObjectId(ACCOUNT_ID),
      address: "0xabc",
      codename: "tester",
      timezone: TZ,
      emailRemindersEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await memory.collection(COLLECTIONS.events).insertOne(eventDoc());
    await addPushSubscription();

    const result = await processDueReminders(now);

    expect(emailSends).toEqual([]);
    expect(pushSends).toEqual(["https://push.example/abc"]);
    expect(result.sent).toBe(1);
  });
});
