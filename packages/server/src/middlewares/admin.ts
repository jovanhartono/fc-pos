import { sql } from "drizzle-orm";
import { every } from "hono/combine";
import { createMiddleware } from "hono/factory";
import { jwt } from "hono/jwt";
import { db } from "@/db";
import { UnauthorizedException } from "@/http-exceptions";
import type { AdminEnv } from "@/types/hono";

const findUserAuthStatePrepared = db.query.usersTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
    columns: { role: true, is_active: true, can_process_pickup: true },
    with: { userStores: { columns: { store_id: true } } },
  })
  .prepare("find_user_auth_state");

// The JWT proves identity only. Role, pickup rights and Stores are re-read every
// request so a deactivated or demoted User loses access at once, not at expiry
// (ADR-0006).
const refreshAuthState = createMiddleware<AdminEnv>(async (c, next) => {
  const payload = c.get("jwtPayload");

  const user = await findUserAuthStatePrepared.execute({ id: payload.id });

  if (!user?.is_active) {
    throw new UnauthorizedException(
      "User is not active. Please contact admin."
    );
  }

  c.set("jwtPayload", {
    ...payload,
    role: user.role,
    can_process_pickup: user.can_process_pickup,
    store_ids: user.userStores.map((row) => row.store_id),
  });

  await next();
});

export const adminMiddleware = every(
  jwt({ secret: process.env.JWT_SECRET as string, alg: "HS256" }),
  refreshAuthState
);
