import { forbidden, notFound } from "@/api/lib/errors";
import { serializeDoc } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { createUserSchema, updateUserSchema } from "@/schemas/user";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ObjectId } from "mongodb";

export const usersRoutes = new Hono<{ Variables: SessionVariables }>();

usersRoutes.get("/me", sessionAuth, async (c) => {
  const accountId = c.get("accountId");
  const { users } = getCollections(getDb());
  const user = await users.findOne({ _id: new ObjectId(accountId) });
  if (!user) notFound("User not found");
  return c.json({ user: serializeDoc(user, { keepAddress: true }) });
});

usersRoutes.post("/", sessionAuth, zValidator("json", createUserSchema), async (c) => {
  const body = c.req.valid("json");
  const accountId = c.get("accountId");
  const { users } = getCollections(getDb());
  const sessionUser = await users.findOne({ _id: new ObjectId(accountId) });
  if (!sessionUser) notFound("User not found");
  if (body.address.toLowerCase() !== sessionUser.address) {
    forbidden("Address must match your signed-in session");
  }

  /* Auth verify already created this user — only update the session account. */
  const updated = await users.findOneAndUpdate(
    { _id: new ObjectId(accountId) },
    {
      $set: {
        codename: body.codename,
        notifyEmail: body.notifyEmail || "",
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );

  if (!updated) notFound("User not found");
  return c.json({ user: serializeDoc(updated, { keepAddress: true }) });
});

usersRoutes.patch("/me", sessionAuth, zValidator("json", updateUserSchema), async (c) => {
  const accountId = c.get("accountId");
  const body = c.req.valid("json");
  const { users } = getCollections(getDb());

  const updated = await users.findOneAndUpdate(
    { _id: new ObjectId(accountId) },
    { $set: { ...body, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) notFound("User not found");
  return c.json({ user: serializeDoc(updated, { keepAddress: true }) });
});
