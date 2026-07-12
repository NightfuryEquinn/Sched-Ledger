/**
 * Smoke test for security fixes: nonce single-use, budgets payload validation,
 * session auth, duplicate-name handling.
 *
 * Requires MONGODB_URI pointing at a disposable database, e.g. one started via
 * mongodb-memory-server. Run: MONGODB_URI=... bun scripts/smoke-security-fixes.ts
 */
import { Wallet } from "ethers";

if (!process.env.MONGODB_URI) {
  console.error("Set MONGODB_URI to a disposable test database first.");
  process.exit(1);
}
process.env.MONGODB_DB = "ledger_test";
process.env.NODE_ENV = "development";

const { connectDb } = await import("@/db/client");
await connectDb();
const { createApiApp } = await import("@/api/app");
const app = createApiApp();

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const wallet = Wallet.createRandom();
const address = wallet.address.toLowerCase();

async function req(path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return app.request(`http://localhost/api${path}`, { ...init, headers });
}

// --- auth flow ---
const chRes = await req("/auth/challenge", {
  method: "POST",
  body: JSON.stringify({ address }),
});
check("challenge returns 200", chRes.status === 200);
const { message } = (await chRes.json()) as { message: string };
const signature = await wallet.signMessage(message);

const v1 = await req("/auth/verify", {
  method: "POST",
  body: JSON.stringify({ address, message, signature }),
});
check("verify with valid signature returns 200", v1.status === 200, String(v1.status));
const setCookie = v1.headers.get("set-cookie") ?? "";
const cookie = setCookie.split(";")[0]!;
check("session cookie issued", cookie.startsWith("ledger_session="));

// nonce reuse must fail
const v2 = await req("/auth/verify", {
  method: "POST",
  body: JSON.stringify({ address, message, signature }),
});
check("nonce reuse rejected (400)", v2.status === 400, String(v2.status));

// wrong signature must fail
const ch2 = await req("/auth/challenge", { method: "POST", body: JSON.stringify({ address }) });
const { message: msg2 } = (await ch2.json()) as { message: string };
const badSig = await Wallet.createRandom().signMessage(msg2);
const v3 = await req("/auth/verify", {
  method: "POST",
  body: JSON.stringify({ address, message: msg2, signature: badSig }),
});
check("wrong-wallet signature rejected (400)", v3.status === 400, String(v3.status));

// bad signature must not consume the nonce
const goodSig2 = await wallet.signMessage(msg2);
const v4 = await req("/auth/verify", {
  method: "POST",
  body: JSON.stringify({ address, message: msg2, signature: goodSig2 }),
});
check("nonce still usable after failed attempt", v4.status === 200, String(v4.status));

// --- session-gated CRUD ---
const noAuth = await req("/expenses");
check("expenses without session rejected (401)", noAuth.status === 401, String(noAuth.status));

const me = await req("/auth/me", {}, cookie);
check("auth/me with session returns 200", me.status === 200, String(me.status));

const wRes = await req("/wallets", {}, cookie);
check("wallets list returns 200", wRes.status === 200, String(wRes.status));
const { wallets } = (await wRes.json()) as { wallets: Array<{ id: string }> };
check("default wallet auto-created", wallets.length === 1);
const walletId = wallets[0]!.id;

// budgets: oversized payload must now be rejected by zod
const big = await req(`/wallets/${walletId}/budgets`, {
  method: "PUT",
  body: JSON.stringify({ enc: 1, payload: "x".repeat(20_000) }),
}, cookie);
check("oversized budgets payload rejected (400)", big.status === 400, String(big.status));

const okBudget = await req(`/wallets/${walletId}/budgets`, {
  method: "PUT",
  body: JSON.stringify({ enc: 1, payload: "dGVzdA==" }),
}, cookie);
check("valid budgets payload accepted (200)", okBudget.status === 200, String(okBudget.status));

const badEnc = await req(`/wallets/${walletId}/budgets`, {
  method: "PUT",
  body: JSON.stringify({ enc: 2, payload: "dGVzdA==" }),
}, cookie);
check("wrong enc version rejected (400)", badEnc.status === 400, String(badEnc.status));

// todo lists: duplicate name -> 400, not 500
const t1 = await req("/todo-lists", {
  method: "POST",
  body: JSON.stringify({ name: "Groceries", icon: "🛒" }),
}, cookie);
check("todo list create returns 201", t1.status === 201, String(t1.status));
const t2 = await req("/todo-lists", {
  method: "POST",
  body: JSON.stringify({ name: "Groceries", icon: "🛒" }),
}, cookie);
check("duplicate todo list returns 400", t2.status === 400, String(t2.status));

// health endpoint must not leak error detail shape
const health = await req("/health");
check("health returns ok", health.status === 200);

// logout
const out = await req("/auth/logout", { method: "POST" }, cookie);
check("logout returns 200", out.status === 200);
const after = await req("/auth/me", {}, cookie);
check("session revoked after logout (401)", after.status === 401, String(after.status));

const { closeDb } = await import("@/db/client");
await closeDb();
if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
process.exit(0);
