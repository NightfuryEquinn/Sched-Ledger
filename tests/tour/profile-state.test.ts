import { createApiApp } from "@/api/app";
import { SESSION_COOKIE } from "@/api/lib/auth";
import { resetRateLimitsForTests } from "@/api/middleware/rate-limit";
import { Wallet } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { installMemoryDb, uninstallMemoryDb, type MemoryDb } from "../helpers/memory-db";

const app = createApiApp();

type ProfileBody = {
  profile: { currentMonth: string; tourPreference: string; toursSeen: string[] };
};

/** Sign in a fresh wallet and return its session cookie header value. */
async function signIn(): Promise<string> {
  const wallet = Wallet.createRandom();

  const challengeRes = await app.request("/api/auth/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: wallet.address }),
  });
  const challenge = (await challengeRes.json()) as { message: string };
  const signature = await wallet.signMessage(challenge.message);

  const verifyRes = await app.request("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: wallet.address, message: challenge.message, signature }),
  });
  const setCookie = verifyRes.headers.get("set-cookie") || "";
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));

  return `${SESSION_COOKIE}=${match![1]!}`;
}

/** PATCH the profile with an arbitrary body and return status + parsed JSON. */
async function patchProfile(cookie: string, body: unknown) {
  const res = await app.request("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });

  return { status: res.status, json: (await res.json()) as ProfileBody };
}

describe("profile carries guided-tour onboarding state", () => {
  let memory: MemoryDb;

  beforeAll(() => {
    memory = installMemoryDb();
  });

  afterAll(() => {
    uninstallMemoryDb();
  });

  beforeEach(() => {
    memory._reset();
    resetRateLimitsForTests();
  });

  test("a fresh profile reads as never asked", async () => {
    const cookie = await signIn();

    const res = await app.request("/api/profile", { headers: { cookie } });
    const { profile } = (await res.json()) as ProfileBody;

    expect(profile.tourPreference).toBe("pending");
    expect(profile.toursSeen).toEqual([]);
  });

  test("PATCH persists the choice and the seen list", async () => {
    const cookie = await signIn();

    const saved = await patchProfile(cookie, {
      tourPreference: "explore",
      toursSeen: ["shell", "overview"],
    });
    expect(saved.status).toBe(200);
    expect(saved.json.profile.tourPreference).toBe("explore");
    expect(saved.json.profile.toursSeen).toEqual(["shell", "overview"]);

    /* Survives a reload — this is the whole point of moving it off localStorage. */
    const reread = await app.request("/api/profile", { headers: { cookie } });
    const { profile } = (await reread.json()) as ProfileBody;

    expect(profile.tourPreference).toBe("explore");
    expect(profile.toursSeen).toEqual(["shell", "overview"]);
  });

  test("a month change leaves onboarding state alone", async () => {
    const cookie = await signIn();
    await patchProfile(cookie, { tourPreference: "guided", toursSeen: ["shell"] });

    const { json } = await patchProfile(cookie, { currentMonth: "2026-07" });

    expect(json.profile.currentMonth).toBe("2026-07");
    expect(json.profile.tourPreference).toBe("guided");
    expect(json.profile.toursSeen).toEqual(["shell"]);
  });

  test("an unknown preference is rejected", async () => {
    const cookie = await signIn();

    const { status } = await patchProfile(cookie, { tourPreference: "whatever" });

    expect(status).toBe(400);
  });
});
