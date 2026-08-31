import { createMiddleware } from "hono/factory";
import {
  API_CONTENT_SECURITY_POLICY,
  HSTS_VALUE,
  SECURITY_HEADER_NAMES,
  STATIC_SECURITY_HEADERS,
  shouldSetHsts,
} from "@/lib/security-headers";

export const securityHeaders = createMiddleware(async (c, next) => {
  await next();

  for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    c.header(key, value);
  }

  c.header(SECURITY_HEADER_NAMES.csp, API_CONTENT_SECURITY_POLICY);

  const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (shouldSetHsts(proto)) {
    c.header(SECURITY_HEADER_NAMES.hsts, HSTS_VALUE);
  }
});
