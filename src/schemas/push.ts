import { z } from "zod";

/* The endpoint is fetched server-side by web-push, so it must be a real URL —
   never accept an arbitrary string here. */
const endpointSchema = z.string().url().max(2048);

export const pushSubscribeSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: endpointSchema,
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;
