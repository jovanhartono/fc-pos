import type { InferInsertModel } from "drizzle-orm";
import type { storesTable } from "@/db/schema";
import type { GetNearestStoreQuery } from "@/modules/stores/store.schema";
import {
  createStoreService,
  getNearestStores,
  getStoreById,
  getStores,
  updateStoreService,
  updateStoreStatusService,
} from "@/modules/stores/store.service";

export function getStoresController() {
  return getStores();
}

export function getNearestStoresController(query: GetNearestStoreQuery) {
  return getNearestStores(query);
}

export function getStoreByIdController(id: number) {
  return getStoreById(id);
}

export function createStoreController(
  payload: InferInsertModel<typeof storesTable>
) {
  return createStoreService(payload);
}

export function updateStoreController({
  id,
  payload,
}: {
  id: number;
  payload: Partial<InferInsertModel<typeof storesTable>>;
}) {
  return updateStoreService({ id, payload });
}

export function updateStoreStatusController({
  id,
  is_active,
}: {
  id: number;
  is_active: boolean;
}) {
  return updateStoreStatusService({ id, is_active });
}
