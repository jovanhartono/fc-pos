import { asc, eq } from 'drizzle-orm';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { db } from '@/db';
import { productsTable } from '@/db/schema';
import { notFoundOrFirst } from '@/utils/helper';
import { failure, success } from '@/utils/http';
import { idParamSchema } from '@/utils/schema';
import { zodValidator } from '@/utils/zod-validator-wrapper';

const POSTProductSchema = createInsertSchema(productsTable);
const PUTProductSchema = createUpdateSchema(productsTable);
const app = new Hono()
  .get('/', async (c) => {
    const users = await db.query.productsTable.findMany({
      orderBy: [asc(productsTable.id)],
      with: {
        category: true,
      },
    });

    return c.json(success(users));
  })
  .get('/:id', idParamSchema, async (c) => {
    const { id } = c.req.valid('param');

    const product = await db.query.productsTable.findFirst({
      where: eq(productsTable.id, id),
    });

    if (!product) {
      return c.json(failure('Product not found', StatusCodes.NOT_FOUND));
    }

    return c.json(success(product, 'Product retrieved successfully'));
  })
  .post('/', zodValidator('json', POSTProductSchema), async (c) => {
    const body = c.req.valid('json');

    const [product] = await db.insert(productsTable).values(body).returning();

    return c.json(
      success(product, 'Create product success'),
      StatusCodes.CREATED
    );
  })
  .put(
    '/:id',
    idParamSchema,
    zodValidator('json', PUTProductSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      const updatedService = await db
        .update(productsTable)
        .set(body)
        .where(eq(productsTable.id, id))
        .returning();

      const product = notFoundOrFirst(
        updatedService,
        c,
        'Service does not exist'
      );
      if (product instanceof Response) {
        return product;
      }

      return c.json(success(product, `Update service ${product.sku} success`));
    }
  );

export default app;
