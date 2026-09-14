import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { JwtVariables } from "hono/jwt";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import type { JWTPayload } from "@/types/jwt";

const app = new Hono<{ Variables: JwtVariables<JWTPayload> }>()
  .basePath("/api")
  .use(logger())
  .use(secureHeaders())
  .use(
    // Only local Vite needs this. Deployed, vercel.json rewrites /api/* to this
    // service, so the dashboard and the API share one origin and nothing the
    // browser sends is ever cross-origin.
    cors({
      origin: ["http://localhost:5173", "http://localhost:4173"],
    })
  )
  .use(
    // Photos never reach this body — the counter uploads them straight to S3
    // by presigned PUT — so 1 MiB comfortably covers the largest JSON payload
    // (an Order with every line filled in).
    bodyLimit({ maxSize: 1024 * 1024 })
  );

export default app;
