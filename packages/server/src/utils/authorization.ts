import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { ForbiddenException, NotFoundException } from "@/errors";
import type { JWTPayload } from "@/types";

const getUserStoreIdsPrepared = db.query.userStoresTable
  .findMany({
    where: { user_id: { eq: sql.placeholder("user_id") } },
    columns: { store_id: true },
  })
  .prepare("get_user_store_ids");

export async function getUserStoreIds(userId: number): Promise<number[]> {
  const rows = await getUserStoreIdsPrepared.execute({ user_id: userId });
  return rows.map((row) => row.store_id);
}

const findUserStoreAccessPrepared = db.query.userStoresTable
  .findFirst({
    where: {
      user_id: { eq: sql.placeholder("user_id") },
      store_id: { eq: sql.placeholder("store_id") },
    },
    columns: { id: true },
  })
  .prepare("find_user_store_access");

export async function assertStoreAccess(user: JWTPayload, storeId: number) {
  if (user.role === "admin") {
    return;
  }

  const access = await findUserStoreAccessPrepared.execute({
    user_id: user.id,
    store_id: storeId,
  });

  if (!access) {
    throw new ForbiddenException("You do not have access to this store");
  }
}

const findOrderForAccessPrepared = db.query.ordersTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
    columns: { id: true, store_id: true },
  })
  .prepare("find_order_for_access");

export async function assertOrderAccess(user: JWTPayload, orderId: number) {
  const order = await findOrderForAccessPrepared.execute({ id: orderId });

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
