import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outdir = path.join(root, "dist");
await rm(outdir, { recursive: true, force: true });

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

const frontend = await Bun.build({
  entrypoints,
  outdir,
  minify: true,
  target: "browser",
  sourcemap: false,
  splitting: true,
  /* Keep woff2 as hashed files instead of base64 data URIs (smaller CSS). */
  loader: { ".woff2": "file" },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!frontend.success) {
  console.error(frontend.logs);
  process.exit(1);
}

for (const output of frontend.outputs) {
  console.log(` ${path.relative(root, output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}

/*
 * Bun's HTML bundler mis-references the entry chunk in the emitted <script src>
 * under splitting:true — it can point at an unrelated chunk instead of the real
 * entry-point, leaving the app unmounted (blank page) in production. Patch the
 * script tag to the actual entry-point chunk after the fact.
 */
const jsEntries = frontend.outputs.filter(
  (o) => o.kind === "entry-point" && o.path.endsWith(".js"),
);
const htmlEntries = frontend.outputs.filter(
  (o) => o.kind === "entry-point" && o.path.endsWith(".html"),
);
if (jsEntries.length !== 1 || htmlEntries.length !== 1) {
  console.error(
    `Expected exactly one JS entry-point and one HTML entry-point, got ${jsEntries.length} JS / ${htmlEntries.length} HTML`,
  );
  process.exit(1);
}
const entryChunkName = path.basename(jsEntries[0]!.path);
const htmlPath = htmlEntries[0]!.path;
const html = await Bun.file(htmlPath).text();
const patched = html.replace(/src="\.\/chunk-[^"]+\.js"/, `src="./${entryChunkName}"`);
if (patched === html && !html.includes(`src="./${entryChunkName}"`)) {
  console.error("Could not locate the entry <script src> to patch in index.html");
  process.exit(1);
}
await Bun.write(htmlPath, patched);

const apiDir = path.join(root, "api");
await mkdir(apiDir, { recursive: true });
await rm(path.join(apiDir, "index.js"), { force: true });
await rm(path.join(apiDir, "vercel-api.js"), { force: true });

/* Drop prior hashed email assets from the old type:"file" import approach. */
for await (const entry of new Bun.Glob("logo-*.png").scan({ cwd: apiDir })) {
  await rm(path.join(apiDir, entry), { force: true });
}

/* Embed the logo in the API bundle so Vercel serverless has no sidecar PNG. */
const logoBytes = await Bun.file(path.join(root, "src/frontend/assets/logo.png")).arrayBuffer();
const logoBase64 = Buffer.from(logoBytes).toString("base64");

const api = await Bun.build({
  entrypoints: ["./src/vercel-api.ts"],
  outdir: "./api",
  minify: true,
  target: "bun",
  define: {
    __EMAIL_LOGO_BASE64__: JSON.stringify(logoBase64),
  },
});

if (!api.success) {
  console.error(api.logs);
  process.exit(1);
}

await rename(path.join(apiDir, "vercel-api.js"), path.join(apiDir, "index.js"));

const apiBundle = path.join(apiDir, "index.js");
const { size } = await Bun.file(apiBundle).stat();
console.log(` ${path.relative(root, apiBundle)}  ${(size / 1024).toFixed(1)} KB`);
console.log(` embedded email logo  ${(logoBytes.byteLength / 1024).toFixed(1)} KB`);

/* Copy PWA assets (manifest + service worker) into dist. */
const publicDir = path.join(root, "public");
for await (const entry of new Bun.Glob("*").scan({ cwd: publicDir })) {
  const src = path.join(publicDir, entry);
  const dest = path.join(outdir, entry);
  await Bun.write(dest, Bun.file(src));
  const st = await Bun.file(dest).stat();
  console.log(` ${path.relative(root, dest)}  ${(st.size / 1024).toFixed(1)} KB`);
}
