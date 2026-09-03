import { HTML_CONTENT_SECURITY_POLICY } from "@/lib/security-headers";
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");

const WOFF2_FILES = [
  "young-serif-latin.woff2",
  "young-serif-latin-ext.woff2",
  "schibsted-grotesk-latin.woff2",
  "schibsted-grotesk-latin-ext.woff2",
  "schibsted-grotesk-italic-latin.woff2",
  "schibsted-grotesk-italic-latin-ext.woff2",
  "azeret-mono-latin.woff2",
  "azeret-mono-latin-ext.woff2",
  "azeret-mono-italic-latin.woff2",
  "azeret-mono-italic-latin-ext.woff2",
];

describe("self-hosted brand fonts", () => {
  test("the app shell does not load typefaces from Google Fonts", () => {
    const html = readFileSync(join(root, "src/index.html"), "utf8");

    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });

  test("the marketing site does not load typefaces from Google Fonts", () => {
    const html = readFileSync(join(root, "website/index.html"), "utf8");

    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });

  test("CSS declares Young Serif, Schibsted Grotesk, and Azeret Mono", () => {
    const css = readFileSync(join(root, "src/frontend/styles/fonts.css"), "utf8");

    expect(css).toContain('font-family: "Young Serif"');
    expect(css).toContain('font-family: "Schibsted Grotesk"');
    expect(css).toContain('font-family: "Azeret Mono"');
  });

  test("woff2 files are present for the app and the marketing site", () => {
    for (const name of WOFF2_FILES) {
      expect(existsSync(join(root, "src/frontend/assets/fonts", name))).toBe(true);
      expect(existsSync(join(root, "website/fonts", name))).toBe(true);
    }
  });

  test("HTML CSP allows same-origin fonts and does not depend on Google", () => {
    expect(HTML_CONTENT_SECURITY_POLICY).not.toContain("fonts.googleapis.com");
    expect(HTML_CONTENT_SECURITY_POLICY).not.toContain("fonts.gstatic.com");
    expect(HTML_CONTENT_SECURITY_POLICY).toContain("font-src 'self'");
  });
});
