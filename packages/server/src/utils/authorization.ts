import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ordersTable, userStoresTable } from "@/db/schema";
import { ForbiddenException, NotFoundException } from "@/errors";
import type { JWTPayload } from "@/types";

export async function getUserStoreIds(userId: number): Promise<number[]> {
  const rows = await db.query.userStoresTable.findMany({
    where: eq(userStoresTable.user_id, userId),
    columns: { store_id: true },
  });

  return rows.map((row) => row.store_id);
}

export async function assertStoreAccess(user: JWTPayload, storeId: number) {
  if (user.role === "admin") {
    return;
  }

  const access = await db.query.userStoresTable.findFirst({
    where: and(
      eq(userStoresTable.user_id, user.id),
      eq(userStoresTable.store_id, storeId)
    ),
    columns: { id: true },
  });

  if (!access) {
    throw new ForbiddenException("You do not have access to this store");
  }
}

export async function assertOrderAccess(user: JWTPayload, orderId: number) {
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, orderId),
    columns: { id: true, store_id: true },
  });

  if (!order) {
    throw new NotFoundException("Order not found");
  }

  await assertStoreAccess(user, order.store_id);
  return order;
}

export async function buildStoreWhereClause(user: JWTPayload) {
  if (user.role === "admin") {
    return undefined;
  }

  const storeIds = await getUserStoreIds(user.id);
  if (storeIds.length === 0) {
    return eq(ordersTable.id, -1);
  }

  return inArray(ordersTable.store_id, storeIds);
}
