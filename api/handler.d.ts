/**
 * Types for the build-emitted API bundle (`bun run build` → api/handler.js).
 * The .js file is gitignored; this declaration keeps typecheck working on a clean tree.
 */
declare const handler: {
  fetch(req: Request): Response | Promise<Response>;
};

export default handler;
