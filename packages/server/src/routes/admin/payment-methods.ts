import { asc, eq } from 'drizzle-orm';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { db } from '@/db';
import { paymentMethodsTable } from '@/db/schema';
import { notFoundOrFirst } from '@/utils/helper';
import { failure, success } from '@/utils/http';
               import { idParamSchema } from '@/utils/schema';
import { WhereClauseBuilder } from "@/utils/where-clause-utils";
import { zodValidator } from '@/utils/zod-validator-wrapper';

const POSTPaymentMethodSchema = createInsertSchema(paymentMethodsTable);
const PUTPaymentMethodSchema = createUpdateSchema(paymentMethodsTable);

const paymentMethodsQuerySchema = z
  .object({ is_active: z.coerce.boolean().optional() })
  .optional();

const app = new Hono()
  .get('/', zodValidator('query', paymentMethodsQuerySchema), async (c) => {
    const query = c.req.valid('query') || {};
    const { is_active } = query;
    const whereClause = new WhereClauseBuilder().addCondition(paymentMethodsTable.is_active, 'eq', is_active).build();

    const paymentMethods = await db.query.paymentMethodsTable.findMany({
      orderBy: [asc(paymentMethodsTable.id)],
      where: whereClause,
    });

    return c.json(success(paymentMethods));
  })
  .get('/:id', idParamSchema, async (c) => {
    const { id } = c.req.valid('param');

    const paymentMethod = await db.query.paymentMethodsTable.findFirst({
      where: eq(paymentMethodsTable.id, id),
    });

    if (!paymentMethod) {
      return c.json(failure('Payment Method not found', StatusCodes.NOT_FOUND));
    }

    return c.json(success(paymentMethod, 'Payment Method retrieved successfully'));
  })
  .post('/', zodValidator('json', POSTPaymentMethodSchema), async (c) => {
    const body = c.req.valid('json');

    const [paymentMethod] = await db
      .insert(paymentMethodsTable)
      .values(body)
      .returning();

    return c.json(
      success(paymentMethod, 'Create payment method success'),
      StatusCodes.CREATED
    );
  })
  .put(
    '/:id',
    idParamSchema,
    zodValidator('json', PUTPaymentMethodSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      const updatedPaymentMethod = await db
        .update(paymentMethodsTable)
        .set(body)
        .where(eq(paymentMethodsTable.id, id))
        .returning();

      const paymentMethod = notFoundOrFirst(
        updatedPaymentMethod,
        c,
        'Payment method does not exist'
      );
      if (paymentMethod instanceof Response) {
        return paymentMethod;
      }

      return c.json(
        success(paymentMethod, `Update payment method ${paymentMethod.name} success`)
      );
    }
  );

export default app;
