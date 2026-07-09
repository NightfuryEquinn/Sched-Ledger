import { badRequest, notFound } from "@/api/lib/errors";
import { serializeDoc, serializeDocs } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { budgetsSchema, objectIdSchema } from "@/schemas/common";
import {
  createWalletSchema,
  defaultWallet,
  updateWalletSchema,
} from "@/schemas/wallet";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ObjectId } from "mongodb";

export const walletsRoutes = new Hono<{ Variables: SessionVariables }>();

walletsRoutes.use("*", sessionAuth);

async function migrateLegacyData(walletAddress: string) {
  const { financialWallets, ledgerProfiles, expenses } = getCollections(getDb());
  const existing = await financialWallets.find({ userAddress: walletAddress }).toArray();
  if (existing.length > 0) return existing;

  const profile = await ledgerProfiles.findOne({ userAddress: walletAddress });
  const now = new Date();
  const seed = defaultWallet(walletAddress, {
    income: profile?.income ?? 0,
    budgets: profile?.budgets,
  });

  const result = await financialWallets.insertOne({
    ...seed,
    createdAt: now,
    updatedAt: now,
  });

  await expenses.updateMany(
    { userAddress: walletAddress, walletId: { $exists: false } },
    { $set: { walletId: result.insertedId } },
  );

  await financialWallets.updateMany(
    { userAddress: walletAddress, fundingMode: { $exists: false } },
    { $set: { fundingMode: "monthly", startingBalance: 0 } },
  );

  await expenses.updateMany(
    { userAddress: walletAddress, kind: { $exists: false } },
    { $set: { kind: "expense" } },
  );

  const created = await financialWallets.findOne({ _id: result.insertedId });
  return created ? [created] : [];
}

async function getUserWallets(walletAddress: string) {
  const wallets = await migrateLegacyData(walletAddress);
  const { financialWallets, expenses } = getCollections(getDb());
  await financialWallets.updateMany(
    { userAddress: walletAddress, fundingMode: { $exists: false } },
    { $set: { fundingMode: "monthly", startingBalance: 0 } },
  );
  await expenses.updateMany(
    { userAddress: walletAddress, kind: { $exists: false } },
    { $set: { kind: "expense" } },
  );
  if (wallets.length > 0) {
    return financialWallets.find({ userAddress: walletAddress }).sort({ createdAt: 1 }).toArray();
  }

  return financialWallets.find({ userAddress: walletAddress }).sort({ createdAt: 1 }).toArray();
}

async function findOwnedWallet(walletAddress: string, walletId: string) {
  const { financialWallets } = getCollections(getDb());
  return financialWallets.findOne({
    _id: new ObjectId(walletId),
    userAddress: walletAddress,
  });
}

walletsRoutes.get("/", async (c) => {
  const walletAddress = c.get("walletAddress");
  const wallets = await getUserWallets(walletAddress);
  return c.json({ wallets: serializeDocs(wallets) });
});

walletsRoutes.get("/:id", async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Wallet not found");

  await migrateLegacyData(walletAddress);
  const doc = await findOwnedWallet(walletAddress, id.data);
  if (!doc) notFound("Wallet not found");

  return c.json({ wallet: serializeDoc(doc) });
});

walletsRoutes.post("/", zValidator("json", createWalletSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const body = c.req.valid("json");
  const { financialWallets } = getCollections(getDb());

  await migrateLegacyData(walletAddress);

  const count = await financialWallets.countDocuments({ userAddress: walletAddress });
  const now = new Date();

  const result = await financialWallets.insertOne({
    userAddress: walletAddress,
    name: body.name,
    currency: body.currency,
    fundingMode: body.fundingMode,
    income: body.fundingMode === "monthly" ? body.income : 0,
    startingBalance: body.fundingMode === "starting" ? body.startingBalance : 0,
    budgets: defaultWallet(walletAddress).budgets,
    isDefault: count === 0,
    createdAt: now,
    updatedAt: now,
  });

  const doc = await financialWallets.findOne({ _id: result.insertedId });
  if (!doc) notFound("Wallet not found");

  return c.json({ wallet: serializeDoc(doc) }, 201);
});

walletsRoutes.patch("/:id", zValidator("json", updateWalletSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Wallet not found");

  const body = c.req.valid("json");
  const { financialWallets } = getCollections(getDb());

  await migrateLegacyData(walletAddress);

  if (body.isDefault === false) {
    const target = await findOwnedWallet(walletAddress, id.data);
    if (target?.isDefault) {
      badRequest("Cannot unset the default wallet. Set another wallet as default instead.");
    }
  }

  if (body.isDefault === true) {
    await financialWallets.updateMany(
      { userAddress: walletAddress, isDefault: true },
      { $set: { isDefault: false, updatedAt: new Date() } },
    );
  }

  const updated = await financialWallets.findOneAndUpdate(
    { _id: new ObjectId(id.data), userAddress: walletAddress },
    { $set: { ...body, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) notFound("Wallet not found");
  return c.json({ wallet: serializeDoc(updated) });
});

walletsRoutes.put("/:id/budgets", async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Wallet not found");

  const body = await c.req.json();
  const parsed = budgetsSchema.safeParse(body?.budgets);
  if (!parsed.success) badRequest("budgets is required");

  const { financialWallets } = getCollections(getDb());
  await migrateLegacyData(walletAddress);

  const updated = await financialWallets.findOneAndUpdate(
    { _id: new ObjectId(id.data), userAddress: walletAddress },
    { $set: { budgets: parsed.data, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) notFound("Wallet not found");
  return c.json({ wallet: serializeDoc(updated) });
});

walletsRoutes.delete("/:id", async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Wallet not found");

  const { financialWallets, expenses } = getCollections(getDb());
  await migrateLegacyData(walletAddress);

  const doc = await findOwnedWallet(walletAddress, id.data);
  if (!doc) notFound("Wallet not found");

  const walletCount = await financialWallets.countDocuments({ userAddress: walletAddress });
  if (walletCount <= 1) badRequest("Cannot delete your only wallet");

  const expenseCount = await expenses.countDocuments({
    userAddress: walletAddress,
    walletId: new ObjectId(id.data),
  });
  if (expenseCount > 0) {
    badRequest("Cannot delete a wallet that has transactions. Move or delete them first.");
  }

  await financialWallets.deleteOne({ _id: new ObjectId(id.data), userAddress: walletAddress });

  if (doc.isDefault) {
    const fallback = await financialWallets.findOne({ userAddress: walletAddress });
    if (fallback) {
      await financialWallets.updateOne(
        { _id: fallback._id },
        { $set: { isDefault: true, updatedAt: new Date() } },
      );
    }
  }

  return c.json({ ok: true });
});

export async function getDefaultWalletId(walletAddress: string): Promise<ObjectId> {
  const wallets = await migrateLegacyData(walletAddress);
  const def = wallets.find((w) => w.isDefault) ?? wallets[0];
  if (def) return def._id;

  const { financialWallets } = getCollections(getDb());
  const fallback = await financialWallets.findOne({ userAddress: walletAddress });
  if (!fallback) throw new Error("No wallet found for user");
  return fallback._id;
}
