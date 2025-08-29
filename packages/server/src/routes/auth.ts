import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { StatusCodes } from 'http-status-codes';
import { db } from '@/db';
import { usersTable } from '@/db/schema';
import type { JWTPayload } from '@/types/jwt';
import { failure, success } from '@/utils/http';

const loginSchema = createInsertSchema(usersTable).pick({
  username: true,
  password: true,
});
const app = new Hono().post(
  '/login',
  zValidator('json', loginSchema),
  async (c) => {
    const { username, password } = c.req.valid('json');

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.username, username),
    });

    if (!(user && (await Bun.password.verify(password, user.password)))) {
      return c.json(
        failure('Invalid username or password'),
        StatusCodes.UNAUTHORIZED
      );
    }

    if (!user.is_active) {
      return c.json(
        failure('User is not active. Please contact admin.'),
        StatusCodes.FORBIDDEN
      );
    }

    const jwtPayload: JWTPayload = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      is_active: user.is_active,
    };
    const token = await sign(jwtPayload, process.env.JWT_SECRET);

    return c.json(success({ token }, 'Login Sucessfull!'), StatusCodes.OK);
  }
);

export default app;
