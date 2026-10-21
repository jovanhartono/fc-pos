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
    // Only local Vite needs this: deployed, vercel.json serves the dashboard and
    // the API from one origin.
    cors({
      origin: ["http://localhost:5173", "http://localhost:4173"],
    })
  )
  .use(
    // Photos go straight to S3, so 1 MiB covers the largest Order the counter sends.
    bodyLimit({ maxSize: 1024 * 1024 })
  );

export default app;
