import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ForbiddenException, NotFoundException } from "@/http-exceptions";
import type { AuthUser } from "@/types";

export function assertStoreAccess(
  user: AuthUser,
  storeId: number
): Promise<void> {
  if (user.role !== "admin" && !user.store_ids.includes(storeId)) {
    return Promise.reject(
      new ForbiddenException("You do not have access to this store")
    );
  }

  return Promise.resolve();
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

// Naming a Store: a cashier at Kemang either works there or is refused. Naming
// none: staff see their own Stores, an admin sees all, and a new hire with no
// Store yet sees nothing.
export async function resolveStoreScope(
  user: AuthUser,
  storeId?: number
): Promise<StoreScope> {
  if (storeId !== undefined) {
    await assertStoreAccess(user, storeId);
    return { kind: "one", storeId };
  }

  if (user.role === "admin") {
    return { kind: "all" };
  }

  return user.store_ids.length === 0
    ? { kind: "none" }
    : { kind: "some", storeIds: user.store_ids };
}

// A scope no screen handled has to stop the request. Falling through would run
// the query with no Store filter at all, which is every Store's takings — so
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

export async function assertOrderAccess(user: AuthUser, orderId: number) {
  const order = await findOrderForAccessPrepared.execute({ id: orderId });

  if (!order) {
    throw new NotFoundException("Order not found");
  }

  await assertStoreAccess(user, order.store_id);
  return order;
}
