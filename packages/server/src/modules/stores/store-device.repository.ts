import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { storeDevicesTable } from "@/db/schema";

export function listStoreDevices(storeId: number) {
  return db.query.storeDevicesTable.findMany({
    where: { store_id: storeId },
    orderBy: { id: "asc" },
  });
}

export function insertStoreDevice(values: {
  store_id: number;
  name: string;
  label?: string;
}) {
  return db.insert(storeDevicesTable).values(values).returning();
}

export function deleteStoreDevice(storeId: number, deviceId: number) {
  return db
    .delete(storeDevicesTable)
    .where(
      and(
        eq(storeDevicesTable.id, deviceId),
        eq(storeDevicesTable.store_id, storeId)
      )
    )
    .returning();
}
