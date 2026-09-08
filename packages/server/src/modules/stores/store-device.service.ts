import {
  deleteStoreDevice,
  insertStoreDevice,
  listStoreDevices,
} from "@/modules/stores/store-device.repository";

export function getStoreDevices(storeId: number) {
  return listStoreDevices(storeId);
}

export async function registerStoreDevice(
  storeId: number,
  payload: { name: string; label?: string }
) {
  const [device] = await insertStoreDevice({ store_id: storeId, ...payload });
  return device;
}

export async function removeStoreDevice(storeId: number, deviceId: number) {
  const [device] = await deleteStoreDevice(storeId, deviceId);
  return device ?? null;
}
