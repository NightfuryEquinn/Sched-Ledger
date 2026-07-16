import tailwind from "bun-plugin-tailwind";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outdir = path.join(root, "dist");
await rm(outdir, { recursive: true, force: true });

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

const frontend = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind],
  minify: true,
  target: "browser",
  sourcemap: "linked",
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
