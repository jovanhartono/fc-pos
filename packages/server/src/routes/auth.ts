import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-orm/zod";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { StatusCodes } from "http-status-codes";
import { db } from "@/db";
import { usersTable } from "@/db/schema";
import { ForbiddenException, UnauthorizedException } from "@/http-exceptions";
import type { JWTPayload } from "@/types/jwt";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const loginSchema = createInsertSchema(usersTable).pick({
  username: true,
  password: true,
});

const findUserByUsernamePrepared = db.query.usersTable
  .findFirst({
    where: { username: { eq: sql.placeholder("username") } },
  })
  .prepare("find_user_by_username");

const app = new Hono().post(
  "/login",
  zodValidator("json", loginSchema),
  async (c) => {
    const { username, password } = c.req.valid("json");

    const user = await findUserByUsernamePrepared.execute({ username });

    if (!user) {
      throw new UnauthorizedException("Invalid username or password");
    }

    let isPasswordValid = false;
    try {
      isPasswordValid = await Bun.password.verify(password, user.password);
    } catch {
      isPasswordValid = false;
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid username or password");
    }

    if (!user.is_active) {
      throw new ForbiddenException("User is not active. Please contact admin.");
    }

    const jwtPayload: JWTPayload & { exp: number } = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      can_process_pickup: user.can_process_pickup,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 1 week
    };
    const token = await sign(jwtPayload, process.env.JWT_SECRET as string);

    return c.json(success({ token }, "Login Sucessfull!"), StatusCodes.OK);
  }
);

export default app;
