import { z } from "zod";

/** Known Web Push endpoint host suffixes (HTTPS only). */
const PUSH_ENDPOINT_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "push.apple.com",
  "notify.windows.com",
] as const;

/** Return true when the URL is an HTTPS push endpoint from a known service. */
function isAllowedPushEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;

    const host = parsed.hostname.toLowerCase();

    return PUSH_ENDPOINT_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

const endpointSchema = z
  .string()
  .url()
  .max(2048)
  .refine(isAllowedPushEndpoint, "Push endpoint must be an HTTPS URL from a known push service");

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
