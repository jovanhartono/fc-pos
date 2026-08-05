import { Hono } from "hono";
import { cors } from "hono/cors";
import type { JwtVariables } from "hono/jwt";
import { logger } from "hono/logger";
import type { JWTPayload } from "@/types/jwt";

const app = new Hono<{ Variables: JwtVariables<JWTPayload> }>()
  .basePath("/api")
  .use(logger())
  .use(
    // Only local Vite needs this. Deployed, vercel.json rewrites /api/* to this
    // service, so the dashboard and the API share one origin and nothing the
    // browser sends is ever cross-origin.
    cors({
      origin: ["http://localhost:5173", "http://localhost:4173"],
    })
  );

export default app;
