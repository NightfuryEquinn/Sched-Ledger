import {
  NEW_ACCOUNT_GRACE_MS,
  shouldAutoShowWhatsNew,
} from "@/frontend/lib/whats-new/should-show";
import { describe, expect, test } from "bun:test";

const NOW = Date.parse("2026-08-11T12:00:00.000Z");

/** ISO timestamp for an account created `ms` before the fixed NOW. */
function createdAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe("shouldAutoShowWhatsNew", () => {
  test("skips when this device already saw the version", () => {
    expect(
      shouldAutoShowWhatsNew({ seen: true, accountCreatedAt: createdAgo(90 * 86_400_000), now: NOW }),
    ).toBe("skip-seen");
  });

  test("skips a brand-new account so the guided tour runs alone", () => {
    expect(
      shouldAutoShowWhatsNew({ seen: false, accountCreatedAt: createdAgo(2 * 60_000), now: NOW }),
    ).toBe("skip-new-account");
  });

  test("shows for a returning account on an unseen device", () => {
    expect(
      shouldAutoShowWhatsNew({ seen: false, accountCreatedAt: createdAgo(30 * 86_400_000), now: NOW }),
    ).toBe("show");
  });

  test("shows when the profile has not loaded a creation time", () => {
    expect(shouldAutoShowWhatsNew({ seen: false, now: NOW })).toBe("show");
  });

  test("shows rather than swallowing the release on an unparseable timestamp", () => {
    expect(
      shouldAutoShowWhatsNew({ seen: false, accountCreatedAt: "not-a-date", now: NOW }),
    ).toBe("show");
  });

  test("treats the grace boundary as no longer brand new", () => {
    expect(
      shouldAutoShowWhatsNew({
        seen: false,
        accountCreatedAt: createdAgo(NEW_ACCOUNT_GRACE_MS),
        now: NOW,
      }),
    ).toBe("show");

    expect(
      shouldAutoShowWhatsNew({
        seen: false,
        accountCreatedAt: createdAgo(NEW_ACCOUNT_GRACE_MS - 1),
        now: NOW,
      }),
    ).toBe("skip-new-account");
  });

  test("seen wins over a brand-new account", () => {
    expect(
      shouldAutoShowWhatsNew({ seen: true, accountCreatedAt: createdAgo(1_000), now: NOW }),
    ).toBe("skip-seen");
  });
});
