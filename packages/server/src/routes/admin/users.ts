import { asc, eq } from 'drizzle-orm';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { db } from '@/db';
import { usersTable } from '@/db/schema';
import { notFoundOrFirst } from '@/utils/helper';
import { failure, success } from '@/utils/http';
import { idParamSchema } from '@/utils/schema';
import { zodValidator } from '@/utils/zod-validator-wrapper';

const POSTUserSchema = createInsertSchema(usersTable);
const PUTUserSchema = createUpdateSchema(usersTable);
const app = new Hono()
  .post('/', zodValidator('json', POSTUserSchema), async (c) => {
    const user = c.req.valid('json');

    const data = await db.insert(usersTable).values(user).returning({
      id: usersTable.id,
      username: usersTable.username,
      is_active: usersTable.is_active,
      role: usersTable.role,
    });

    return c.json(success(data, 'Create user success'), StatusCodes.CREATED);
  })
  // TODO: pagination, limit and offset
  .get('/', async (c) => {
    const users = await db.query.usersTable.findMany({
      columns: {
        password: false,
      },
      orderBy: [asc(usersTable.id)],
    });

    return c.json(success(users));
  })
  .get('/:id', idParamSchema, async (c) => {
    const { id } = c.req.valid('param');

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, id),
    });

    if (!user) {
      return c.json(failure('User not found', StatusCodes.NOT_FOUND));
    }

    return c.json(success(user, 'User retrieved successfully'));
  })
  .put(
    '/:id',
    idParamSchema,
    zodValidator('json', PUTUserSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const {
        created_at: _created_at,
        updated_at: _updated_at,
        ...body
      } = c.req.valid('json');

      const updatedUser = await db
        .update(usersTable)
        .set(body)
        .where(eq(usersTable.id, id))
        .returning();

      const user = notFoundOrFirst(updatedUser, c, 'User does not exist');
      if (user instanceof Response) {
        return user;
      }

      return c.json(success(user, `Update user ${user.name} success`));
    }
  );

export default app;
