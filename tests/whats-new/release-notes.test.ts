import { RELEASE_NOTES } from "@/frontend/lib/whats-new/release-notes";
import { APP_VERSION } from "@/lib/version";
import { describe, expect, test } from "bun:test";

describe("RELEASE_NOTES", () => {
  test("newest entry matches APP_VERSION", () => {
    expect(RELEASE_NOTES[0]?.version).toBe(APP_VERSION);
  });

  test("versions are unique", () => {
    const versions = RELEASE_NOTES.map((notes) => notes.version);

    expect(new Set(versions).size).toBe(versions.length);
  });
});
