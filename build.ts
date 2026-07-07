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

const api = await Bun.build({
  entrypoints: ["./src/vercel-api.ts"],
  outdir: "./api",
  minify: true,
  target: "bun",
});

if (!api.success) {
  console.error(api.logs);
  process.exit(1);
}

await rename(path.join(apiDir, "vercel-api.js"), path.join(apiDir, "index.js"));

const apiBundle = path.join(apiDir, "index.js");
const { size } = await Bun.file(apiBundle).stat();
console.log(` ${path.relative(root, apiBundle)}  ${(size / 1024).toFixed(1)} KB`);
