import { badRequest, notFound } from "@/api/lib/errors";
import { serializeDoc, serializeDocs } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { objectIdSchema } from "@/schemas/common";
import { createWalletSchema, updateWalletSchema } from "@/schemas/wallet";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ObjectId } from "mongodb";

export const walletsRoutes = new Hono<{ Variables: SessionVariables }>();

walletsRoutes.use("*", sessionAuth);

function walletSeed(userAddress: string, name = "Main", currency = "MYR", isDefault = true) {
  return {
    userAddress,
    name,
    currency,
    fundingMode: "monthly" as const,
    isDefault,
  };
}

async function migrateLegacyData(walletAddress: string) {
  const { financialWallets, expenses } = getCollections(getDb());
  const existing = await financialWallets.find({ userAddress: walletAddress }).toArray();
  if (existing.length > 0) return existing;

  const now = new Date();
  const result = await financialWallets.insertOne({
    ...walletSeed(walletAddress),
    createdAt: now,
    updatedAt: now,
  });

  await expenses.updateMany(
    { userAddress: walletAddress, walletId: { $exists: false } },
    { $set: { walletId: result.insertedId } },
  );

  await financialWallets.updateMany(
    { userAddress: walletAddress, fundingMode: { $exists: false } },
    { $set: { fundingMode: "monthly" } },
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
    { $set: { fundingMode: "monthly" } },
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

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.fundingMode !== undefined) patch.fundingMode = body.fundingMode;
  if (body.isDefault !== undefined) patch.isDefault = body.isDefault;
  if ("enc" in body && body.enc === 1) {
    patch.enc = body.enc;
    patch.payload = body.payload;
  }

  const update =
    "enc" in body && body.enc === 1
      ? { $set: patch, $unset: { income: "", startingBalance: "", budgets: "" } }
      : { $set: patch };

  const updated = await financialWallets.findOneAndUpdate(
    { _id: new ObjectId(id.data), userAddress: walletAddress },
    update,
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
  if (body?.enc !== 1 || typeof body?.payload !== "string") {
    badRequest("Encrypted budgets payload is required");
  }

  const { financialWallets } = getCollections(getDb());
  await migrateLegacyData(walletAddress);

  const updated = await financialWallets.findOneAndUpdate(
    { _id: new ObjectId(id.data), userAddress: walletAddress },
    {
      $set: { enc: 1, payload: body.payload, updatedAt: new Date() },
      $unset: { income: "", startingBalance: "", budgets: "" },
    },
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
