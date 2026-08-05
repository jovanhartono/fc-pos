import { sql } from "drizzle-orm";
import { db } from "@/db";
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

interface AllStoresScope {
  kind: "all";
}

interface OneStoreScope {
  kind: "one";
  storeId: number;
}

interface SomeStoresScope {
  kind: "some";
  storeIds: number[];
}

interface NoStoresScope {
  kind: "none";
}

export type StoreScope =
  | AllStoresScope
  | OneStoreScope
  | SomeStoresScope
  | NoStoresScope;

// Every list screen asks the same question: which branches may this person see?
// Naming a branch is an access question — a cashier at Kemang either works there
// or is refused. Naming none is a scoping question — staff see their own
// branches, an admin sees the company, and a new hire with no branch yet has
// nothing to show. Each screen decides what it does with the answer.
export async function resolveStoreScope(
  user: JWTPayload,
  storeId?: number
): Promise<StoreScope> {
  if (storeId !== undefined) {
    await assertStoreAccess(user, storeId);
    return { kind: "one", storeId };
  }

  if (user.role === "admin") {
    return { kind: "all" };
  }

  const storeIds = await getUserStoreIds(user.id);

  return storeIds.length === 0 ? { kind: "none" } : { kind: "some", storeIds };
}

// A scope no screen handled has to stop the request. Falling through would run
// the query with no branch filter at all, which is every branch's takings — so
// adding a fifth kind of scope must fail to compile, not quietly serve the lot.
export function unhandledStoreScope(scope: never): never {
  throw new Error(`Unhandled store scope: ${JSON.stringify(scope)}`);
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
