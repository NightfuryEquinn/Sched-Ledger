/** Vercel serverless entry point — lazily delegates to the bundled API handler emitted by `bun run build`. */
export default async function handler(req: Request): Promise<Response> {
  const mod = await import("./index.js");

  return mod.default(req);
}
