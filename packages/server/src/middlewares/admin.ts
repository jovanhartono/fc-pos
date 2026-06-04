import { sql } from "drizzle-orm";
import { every } from "hono/combine";
import { createMiddleware } from "hono/factory";
import { jwt } from "hono/jwt";
import { db } from "@/db";
import { UnauthorizedException } from "@/errors";
import type { JWTPayload } from "@/types";

const findUserAuthStatePrepared = db.query.usersTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
    columns: { role: true, is_active: true, can_process_pickup: true },
  })
  .prepare("find_user_auth_state");

// JWT proves identity only; role/can_process_pickup are re-read from the DB
// on every request (and inactive users rejected) so deactivation and role
// changes take effect on the next request instead of at token expiry — see
// ADR-0006.
const refreshAuthState = createMiddleware<{
  Variables: { jwtPayload: JWTPayload };
}>(async (c, next) => {
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
  });

  await next();
});

export const adminMiddleware = every(
  jwt({ secret: process.env.JWT_SECRET as string, alg: "HS256" }),
  refreshAuthState
);
