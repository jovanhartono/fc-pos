import type { InferInsertModel } from "drizzle-orm";
import type { usersTable } from "@/db/schema";
import type { GetUsersQuery } from "@/modules/users/user.schema";
import {
  createUserService,
  getUserByIdService,
  getUsersService,
  updateUserService,
  updateUserStoresService,
} from "@/modules/users/user.service";
import type { JWTPayload } from "@/types";

export function createUserController(
  payload: InferInsertModel<typeof usersTable>
) {
  return createUserService(payload);
}

export function getUsersController(query?: GetUsersQuery) {
  return getUsersService(query);
}

export function getUserByIdController(id: number) {
  return getUserByIdService(id);
}

export function updateUserController({
  id,
  payload,
}: {
  id: number;
  payload: Partial<InferInsertModel<typeof usersTable>>;
}) {
  return updateUserService({ id, payload });
}

export function updateUserStoresController({
  actor,
  id,
  store_ids,
}: {
  actor: JWTPayload;
  id: number;
  store_ids: number[];
}) {
  return updateUserStoresService({ actor, id, store_ids });
}
