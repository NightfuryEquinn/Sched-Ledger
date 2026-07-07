import { handle } from "hono/vercel";
import { createApiApp } from "@/api/app";

export default handle(createApiApp());
