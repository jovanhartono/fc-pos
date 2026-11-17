import {
  deleteStoreDevice,
  insertStoreDevice,
  listStoreDevices,
} from "@/modules/stores/store-device.repository";

export const getStoreDevices = (storeId: number) => listStoreDevices(storeId);

export const registerStoreDevice = async (
  storeId: number,
  payload: { name: string; label?: string }
) => {
  const [device] = await insertStoreDevice({ store_id: storeId, ...payload });
  return device;
};

export const removeStoreDevice = async (storeId: number, deviceId: number) => {
  const [device] = await deleteStoreDevice(storeId, deviceId);
  return device ?? null;
};
