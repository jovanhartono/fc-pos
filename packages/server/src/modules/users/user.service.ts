import type { InferInsertModel } from "drizzle-orm";
import type { usersTable } from "@/db/schema";
import { ForbiddenException } from "@/errors";
import {
  buildUsersWhereClause,
  countUsers,
  createUser,
  findUserDetailById,
  listUsers,
  replaceUserStores,
  updateUser,
} from "@/modules/users/user.repository";
import type { GetUsersQuery } from "@/modules/users/user.schema";
import type { JWTPayload } from "@/types";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";

export async function createUserService(
  payload: InferInsertModel<typeof usersTable>
) {
  const passwordHash = await Bun.password.hash(payload.password ?? "");
  const [created] = await createUser({
    ...payload,
    password: passwordHash,
  });

  const { password: _password, ...safeUser } = created;
  return safeUser;
}

export async function getUsersService(query?: GetUsersQuery) {
  const pagination = normalizePagination(query, { maxPageSize: 100 });
  const whereClause = buildUsersWhereClause({
    is_active: query?.is_active,
    role: query?.role,
    search: query?.search,
  });

  const [users, totalRows] = await Promise.all([
    listUsers({
      whereClause,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    countUsers(whereClause),
  ]);

  return {
    items: users,
    meta: buildPaginationMeta(totalRows, pagination),
  };
}

export async function getUserByIdService(id: number) {
  const user = await findUserDetailById(id);
  if (!user) {
    return null;
  }

  const { password: _, ...safeUser } = user;
  return safeUser;
}

export async function updateUserService({
  id,
  payload,
}: {
  id: number;
  payload: Partial<InferInsertModel<typeof usersTable>>;
}) {
  const { password: _payloadPassword, ...values } = payload;
  const [user] = await updateUser(id, values);

  if (!user) {
    return null;
  }

  const { password: _userPassword, ...safeUser } = user;
  return safeUser;
}

export async function updateUserStoresService({
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
