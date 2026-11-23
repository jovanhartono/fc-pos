import type { InferInsertModel, SQL } from "drizzle-orm";
import { and, EmptyFilter, eq, like, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { userStoresTable, usersTable } from "@/db/schema";

const findUserByIdPrepared = db.query.usersTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_user_by_id");

export const findUserById = (userId: number) =>
  findUserByIdPrepared.execute({ id: userId });

interface UserFilters {
  is_active?: boolean;
  role?: "admin" | "cashier" | "worker" | "courier";
  search?: string;
}

const buildRelationalWhere = (filters: UserFilters) => {
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
    return EmptyFilter;
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return { AND: conditions };
};

const buildCountWhere = (filters: UserFilters) => {
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
};

export const listUsers = ({
  filters,
  limit,
  offset,
}: {
  filters: UserFilters;
  limit: number;
  offset: number;
}) =>
  db.query.usersTable.findMany({
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

export const listActiveCouriers = () =>
  db.query.usersTable.findMany({
    columns: { id: true, name: true },
    where: { role: "courier", is_active: true },
    orderBy: { name: "asc" },
  });

export const countUsers = (filters: UserFilters) =>
  db.$count(usersTable, buildCountWhere(filters));

export const findUserDetailById = (id: number) =>
  db.query.usersTable.findFirst({
    where: { id },
    with: {
      userStores: {
        columns: { store_id: true },
      },
    },
  });

export const insertUser = (values: InferInsertModel<typeof usersTable>) =>
  db.insert(usersTable).values(values).returning({
    id: usersTable.id,
    name: usersTable.name,
    username: usersTable.username,
    is_active: usersTable.is_active,
    role: usersTable.role,
    created_at: usersTable.created_at,
    updated_at: usersTable.updated_at,
  });

export const updateUserById = (
  id: number,
  values: Partial<InferInsertModel<typeof usersTable>>
) => db.update(usersTable).set(values).where(eq(usersTable.id, id)).returning();

export const updateUserPasswordById = (id: number, password: string) =>
  db
    .update(usersTable)
    .set({ password })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id, name: usersTable.name });

export const replaceUserStores = (id: number, storeIds: number[]) =>
  db.transaction(async (tx) => {
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
