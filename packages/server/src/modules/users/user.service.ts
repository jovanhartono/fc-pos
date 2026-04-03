import type { InferInsertModel } from "drizzle-orm";
import type { usersTable } from "@/db/schema";
import { ForbiddenException } from "@/errors";
import {
  countUsers,
  findUserDetailById,
  insertUser,
  listUsers,
  replaceUserStores,
  updateUserById,
} from "@/modules/users/user.repository";
import type { GetUsersQuery } from "@/modules/users/user.schema";
import type { JWTPayload } from "@/types";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";

export async function createUser(payload: InferInsertModel<typeof usersTable>) {
  const passwordHash = await Bun.password.hash(payload.password ?? "");
  const [created] = await insertUser({
    ...payload,
    password: passwordHash,
  });

  const { password: _password, ...safeUser } = created;
  return safeUser;
}

export async function getUsers(query?: GetUsersQuery) {
  const pagination = normalizePagination(query, { maxPageSize: 100 });
  const filters = {
    is_active: query?.is_active,
    role: query?.role,
    search: query?.search,
  };

  const [users, totalRows] = await Promise.all([
    listUsers({
      filters,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    countUsers(filters),
  ]);

  return {
    items: users,
    meta: buildPaginationMeta(totalRows, pagination),
  };
}

export async function getUserById(id: number) {
  const user = await findUserDetailById(id);
  if (!user) {
    return null;
  }

  const { password: _, ...safeUser } = user;
  return safeUser;
}

export async function updateUser({
  id,
  payload,
}: {
  id: number;
  payload: Partial<InferInsertModel<typeof usersTable>>;
}) {
  const { password: _payloadPassword, ...values } = payload;
  const [user] = await updateUserById(id, values);

  if (!user) {
    return null;
  }

  const { password: _userPassword, ...safeUser } = user;
  return safeUser;
}

export async function updateUserStores({
  actor,
  id,
  store_ids,
}: {
  actor: JWTPayload;
  id: number;
  store_ids: number[];
}) {
  if (actor.role !== "admin") {
    throw new ForbiddenException("Only admin can update user stores");
  }

  const targetUser = await findUserDetailById(id);
  if (!targetUser) {
    return null;
  }

  const uniqueStoreIds = await replaceUserStores(id, store_ids);
  return { id, store_ids: uniqueStoreIds };
}
