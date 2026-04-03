import type { InferInsertModel } from "drizzle-orm";
import { and, eq, like, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { userStoresTable, usersTable } from "@/db/schema";

const findUserByIdPrepared = db.query.usersTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_user_by_id");

export function findUserById(userId: number) {
  return findUserByIdPrepared.execute({ id: userId });
}

interface UserFilters {
  is_active?: boolean;
  role?: "admin" | "cashier" | "worker";
  search?: string;
}

function buildRelationalWhere(filters: UserFilters) {
  const conditions: Record<string, unknown>[] = [];

  if (filters.is_active !== undefined) {
    conditions.push({ is_active: filters.is_active });
  }

  if (filters.role) {
    conditions.push({ role: filters.role });
  }

  if (filters.search) {
    const searchPrefix = `${filters.search}%`;
    conditions.push({
      OR: [
        { username: { like: searchPrefix } },
        { name: { like: searchPrefix } },
      ],
    });
  }

  if (conditions.length === 0) {
    return undefined;
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return { AND: conditions };
}

function buildCountWhere(filters: UserFilters) {
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
  filters,
  limit,
  offset,
}: {
  filters: UserFilters;
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
    orderBy: { id: "asc" },
    where: buildRelationalWhere(filters),
    limit,
    offset,
  });
}

export function countUsers(filters: UserFilters) {
  return db.$count(usersTable, buildCountWhere(filters));
}

export function findUserDetailById(id: number) {
  return db.query.usersTable.findFirst({
    where: { id },
    with: {
      userStores: {
        columns: { store_id: true },
      },
    },
  });
}

export function insertUser(values: InferInsertModel<typeof usersTable>) {
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

export function updateUserById(
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
