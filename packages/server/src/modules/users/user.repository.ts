import type { InferInsertModel } from "drizzle-orm";
import { and, asc, eq, like, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { userStoresTable, usersTable } from "@/db/schema";

export function findUserById(userId: number) {
  return db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
  });
}

export function buildUsersWhereClause(filters: {
  is_active?: boolean;
  role?: "admin" | "cashier" | "worker";
  search?: string;
}) {
  const conditions: SQL[] = [];

  if (filters.is_active !== undefined) {
    conditions.push(eq(usersTable.is_active, filters.is_active));
  }

  if (filters.role) {
    conditions.push(eq(usersTable.role, filters.role));
  }

  if (filters.search) {
    const searchPrefix = `${filters.search}%`;
    conditions.push(
      or(
        like(usersTable.username, searchPrefix),
        like(usersTable.name, searchPrefix)
      ) as SQL
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function listUsers({
  whereClause,
  limit,
  offset,
}: {
  whereClause?: SQL;
  limit: number;
  offset: number;
}) {
  return db.query.usersTable.findMany({
    columns: { password: false },
    with: {
      userStores: {
        columns: { store_id: true },
      },
    },
    orderBy: [asc(usersTable.id)],
    where: whereClause,
    limit,
    offset,
  });
}

export function countUsers(whereClause?: SQL) {
  return db.$count(usersTable, whereClause);
}

export function findUserDetailById(id: number) {
  return db.query.usersTable.findFirst({
    where: eq(usersTable.id, id),
    with: {
      userStores: {
        columns: { store_id: true },
      },
    },
  });
}

export function createUser(values: InferInsertModel<typeof usersTable>) {
  return db.insert(usersTable).values(values).returning({
    id: usersTable.id,
    name: usersTable.name,
    username: usersTable.username,
    is_active: usersTable.is_active,
    role: usersTable.role,
    created_at: usersTable.created_at,
    updated_at: usersTable.updated_at,
    password: usersTable.password,
  });
}

export function updateUser(
  id: number,
  values: Partial<InferInsertModel<typeof usersTable>>
) {
  return db
    .update(usersTable)
    .set(values)
    .where(eq(usersTable.id, id))
    .returning();
}

export function replaceUserStores(id: number, storeIds: number[]) {
  return db.transaction(async (tx) => {
    await tx.delete(userStoresTable).where(eq(userStoresTable.user_id, id));

    const uniqueStoreIds = [...new Set(storeIds)];
    if (uniqueStoreIds.length > 0) {
      await tx.insert(userStoresTable).values(
        uniqueStoreIds.map((storeId) => ({
          user_id: id,
          store_id: storeId,
        }))
      );
    }

    return uniqueStoreIds;
  });
}
