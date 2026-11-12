import type { InferInsertModel } from "drizzle-orm";
import type { usersTable } from "@/db/schema";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@/http-exceptions";
import {
  countUsers,
  findUserDetailById,
  insertUser,
  listActiveCouriers,
  listUsers,
  replaceUserStores,
  updateUserById,
  updateUserPasswordById,
} from "@/modules/users/user.repository";
import type { GetUsersQuery } from "@/modules/users/user.schema";
import type { JWTPayload } from "@/types";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";
import {
  assertPhotoKeyUnder,
  buildMediaUrl,
  createPresignedUploadUrl,
  newPhotoKey,
  optimizeUploadedImage,
} from "@/utils/s3";

export async function createUser(payload: InferInsertModel<typeof usersTable>) {
  const passwordHash = await Bun.password.hash(payload.password ?? "");
  const [created] = await insertUser({
    ...payload,
    password: passwordHash,
  });

  return created;
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

export function getCouriers() {
  return listActiveCouriers();
}

export async function getUserById(id: number) {
  const user = await findUserDetailById(id);
  if (!user) {
    return null;
  }

  const { password: _, avatar_path, ...safeUser } = user;
  return { ...safeUser, avatar_url: buildMediaUrl(avatar_path) };
}

export async function updateOwnName(userId: number, name: string) {
  await updateUserById(userId, { name });
  return getUserById(userId);
}

// Asks for the current password so a colleague can't take over a phone left
// signed in at the counter. Other devices stay signed in (ADR-0022).
export async function changeOwnPassword({
  userId,
  currentPassword,
  password,
}: {
  userId: number;
  currentPassword: string;
  password: string;
}) {
  const user = await findUserDetailById(userId);
  if (!user) {
    throw new NotFoundException("User not found");
  }

  const isCurrent = await Bun.password
    .verify(currentPassword, user.password)
    .catch(() => false);
  if (!isCurrent) {
    throw new BadRequestException("Wrong password");
  }

  await updateUserPasswordById(userId, await Bun.password.hash(password));
}

export function createAvatarPresign(userId: number, contentType: string) {
  return createPresignedUploadUrl({
    contentType,
    key: newPhotoKey({ kind: "avatar", userId }),
  });
}

// The replaced photo stays in storage, as every replaced photo does.
export async function saveAvatar(userId: number, imagePath: string) {
  assertPhotoKeyUnder(imagePath, { kind: "avatar", userId });
  await optimizeUploadedImage(imagePath);
  await updateUserById(userId, { avatar_path: imagePath });
  return getUserById(userId);
}

export async function removeAvatar(userId: number) {
  await updateUserById(userId, { avatar_path: null });
  return getUserById(userId);
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

// Leaves open sessions alone: making the User inactive is what signs them out.
// See ADR-0022.
export async function resetUserPassword({
  id,
  password,
}: {
  id: number;
  password: string;
}) {
  const passwordHash = await Bun.password.hash(password);
  const [user] = await updateUserPasswordById(id, passwordHash);

  return user ?? null;
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
