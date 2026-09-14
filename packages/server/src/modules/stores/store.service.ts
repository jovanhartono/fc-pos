import type { InferInsertModel } from "drizzle-orm";
import type { storesTable } from "@/db/schema";
import {
  findStoreById,
  insertStore,
  listStores,
  updateStoreById,
  updateStoreIsActive,
} from "@/modules/stores/store.repository";

export function getStores() {
  return listStores();
}

export function getStoreById(id: number) {
  return findStoreById(id);
}

export async function createStore(
  payload: InferInsertModel<typeof storesTable>
) {
  const [store] = await insertStore(payload);
  return store;
}

export async function updateStore({
  id,
  payload,
}: {
  id: number;
  payload: Partial<InferInsertModel<typeof storesTable>>;
}) {
  const [store] = await updateStoreById(id, payload);
  return store ?? null;
}

export async function updateStoreStatus({
  id,
  is_active,
}: {
  id: number;
  is_active: boolean;
}) {
  const [store] = await updateStoreIsActive(id, is_active);
  return store ?? null;
}
