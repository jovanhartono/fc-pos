import dayjs from "dayjs";
import type { InferInsertModel } from "drizzle-orm";
import { eq, sql } from "drizzle-orm/sql";
import type z from "zod";
import { db } from "@/db";
import {
  orderCountersTable,
  ordersProductsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import { NotFoundException } from "@/errors";
import { findProducts } from "@/modules/products/product.repository";
import { findServices } from "@/modules/services/service.repository";
import type { POSTOrderSchema } from "@/schema";
import type { Store, User } from "@/types/entity";

export type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function generateOrderCode(tx: DrizzleTx, store_code: string) {
  const today = dayjs().format("YYYYMM");

  const [counter] = await tx
    .insert(orderCountersTable)
    .values({ store_code, date_str: today, last_number: 1 })
    .onConflictDoUpdate({
      target: [orderCountersTable.store_code, orderCountersTable.date_str],
      set: {
        last_number: sql`${orderCountersTable.last_number} + 1`,
      },
    })
    .returning();

  const code = `${store_code}-${today}-${counter.last_number}`;

  return code;
}

export async function createOrder(
  user: User,
  store: Store,
  payload: z.infer<typeof POSTOrderSchema>
) {
  const { services = [], products = [], ...restPayload } = payload;

  await db.transaction(async (tx) => {
    const orderCode = await generateOrderCode(tx, store.code);

    const [{ order_id }] = await tx
      .insert(ordersTable)
      .values({
        ...restPayload,
        code: orderCode,
        store_id: store.id,
        updated_by: user.id,
        created_by: user.id,
      })
      .returning({ order_id: ordersTable.id });

    let total = 0;

    // Helper to process services/products
    const processItems = async <T extends "service" | "product">(
      type: T,
      items: {
        id: number;
        qty: number;
        notes?: string | null;
      }[]
    ) => {
      if (!items.length) {
        return 0;
      }

      const findFn = type === "service" ? findServices : findProducts;
      const table =
        type === "service" ? ordersServicesTable : ordersProductsTable;

      const dbRows = await findFn(items.map(({ id }) => id));

      const insertRows = items.map((item) => {
        const match = dbRows.find(({ id }) => id === item.id);
        if (!match) {
          throw new NotFoundException(`${type} not found.`);
        }

        return {
          order_id,
          [`${type}_id`]: match.id,
          price: match.price,
          notes: item.notes,
          qty: item.qty,
        } as InferInsertModel<typeof table>;
      });

      const inserted = await tx
        .insert(table)
        .values(insertRows)
        .returning({ subtotal: table.subtotal });

      return inserted.reduce(
        (sum, curr) => sum + Number(curr.subtotal ?? 0),
        0
      );
    };

    // Process both types
    const [serviceSubtotal, productSubtotal] = await Promise.all([
      processItems("service", services),
      processItems("product", products),
    ]);

    total = serviceSubtotal + productSubtotal;

    await tx
      .update(ordersTable)
      .set({ total: total.toString() })
      .where(eq(ordersTable.id, order_id));
  });
}
