import type { InferInsertModel } from "drizzle-orm";
import type { storesTable } from "@/db/schema";
import {
  findNearestStores,
  findStoreById,
  insertStore,
  listStores,
  updateStoreById,
  updateStoreIsActive,
} from "@/modules/stores/store.repository";
import type { GetNearestStoreQuery } from "@/modules/stores/store.schema";

export function getStores() {
  return listStores();
}

export function getStoreById(id: number) {
  return findStoreById(id);
}

export function getNearestStores(query: GetNearestStoreQuery) {
  return findNearestStores({
    latitude: query.latitude,
    longitude: query.longitude,
    limit: query.limit ?? 1,
    radius_km: query.radius_km,
    include_inactive: query.include_inactive ?? false,
  });
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
