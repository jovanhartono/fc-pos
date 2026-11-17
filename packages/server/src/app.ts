import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import type { JwtVariables } from "hono/jwt";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import type { AuthUser } from "@/types/jwt";

// Only local Vite needs these: deployed, vercel.json serves the dashboard and
// the API from one origin.
const LOCAL_WEB_ORIGINS = ["http://localhost:5173", "http://localhost:4173"];

const app = new Hono<{ Variables: JwtVariables<AuthUser> }>()
  .basePath("/api")
  .use(logger())
  .use(secureHeaders())
  .use(cors({ origin: LOCAL_WEB_ORIGINS, credentials: true }))
  .use(
    // The browser attaches the sign-in cookie to a form posted from any other
    // fresclean.id page; only the POS itself may post as the cashier.
    csrf({
      origin: (origin, c) =>
        origin === new URL(c.req.url).origin ||
        LOCAL_WEB_ORIGINS.includes(origin),
    })
  )
  .use(
    // Photos go straight to S3, so 1 MiB covers the largest Order the counter sends.
    bodyLimit({ maxSize: 1024 * 1024 })
  );

export default app;
