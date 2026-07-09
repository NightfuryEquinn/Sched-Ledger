import { forbidden, notFound } from "@/api/lib/errors";
import { serializeDoc } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { walletAddressSchema } from "@/schemas/common";
import { createUserSchema, updateUserSchema } from "@/schemas/user";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export const usersRoutes = new Hono<{ Variables: SessionVariables }>();

usersRoutes.get("/me", sessionAuth, async (c) => {
  const walletAddress = c.get("walletAddress");
  const { users } = getCollections(getDb());
  const user = await users.findOne({ address: walletAddress });
  if (!user) notFound("User not found");
  return c.json({ user: serializeDoc(user) });
});

usersRoutes.post("/", sessionAuth, zValidator("json", createUserSchema), async (c) => {
  const body = c.req.valid("json");
  const walletAddress = c.get("walletAddress");
  if (body.address.toLowerCase() !== walletAddress) {
    forbidden("Address must match your signed-in session");
  }
  const now = new Date();
  const { users } = getCollections(getDb());

  const existing = await users.findOne({ address: body.address });
  if (existing) {
    const updated = await users.findOneAndUpdate(
      { address: body.address },
      {
        $set: {
          codename: body.codename,
          notifyEmail: body.notifyEmail || "",
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    return c.json({ user: serializeDoc(updated!) });
  }

  const result = await users.insertOne({
    address: body.address,
    codename: body.codename,
    notifyEmail: body.notifyEmail || "",
    createdAt: now,
    updatedAt: now,
  });

  const user = await users.findOne({ _id: result.insertedId });
  if (!user) notFound("User not found");
  return c.json({ user: serializeDoc(user) }, 201);
});

usersRoutes.patch("/me", sessionAuth, zValidator("json", updateUserSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const body = c.req.valid("json");
  const { users } = getCollections(getDb());

  const updated = await users.findOneAndUpdate(
    { address: walletAddress },
    { $set: { ...body, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) notFound("User not found");
  return c.json({ user: serializeDoc(updated) });
});

/* Session-gated and self-only: user records include a notification email,
   so they must never be readable by other (or anonymous) callers. */
usersRoutes.get("/:address", sessionAuth, async (c) => {
  const walletAddress = c.get("walletAddress");
  const parsed = walletAddressSchema.safeParse(c.req.param("address"));
  if (!parsed.success) notFound("User not found");
  if (parsed.data.toLowerCase() !== walletAddress) {
    forbidden("You can only view your own profile");
  }

  const { users } = getCollections(getDb());
  const user = await users.findOne({ address: parsed.data });
  if (!user) notFound("User not found");
  return c.json({ user: serializeDoc(user) });
});
