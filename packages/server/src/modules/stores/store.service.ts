import type { InferInsertModel } from "drizzle-orm";

import type { storesTable } from "@/db/schema";
import {
  findStoreById,
  insertStore,
  listStores,
  updateStoreById,
  updateStoreIsActive,
} from "@/modules/stores/store.repository";

export const getStores = () => listStores();

export const getStoreById = (id: number) => findStoreById(id);

export const createStore = async (
  payload: InferInsertModel<typeof storesTable>
) => {
  const [store] = await insertStore(payload);
  return store;
};

export const updateStore = async ({
  id,
  payload,
}: {
  id: number;
  payload: Partial<InferInsertModel<typeof storesTable>>;
}) => {
  const [store] = await updateStoreById(id, payload);
  return store ?? null;
};

export const updateStoreStatus = async ({
  id,
  is_active,
}: {
  id: number;
  is_active: boolean;
}) => {
  const [store] = await updateStoreIsActive(id, is_active);
  return store ?? null;
};
