import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { storeDevicesTable } from "@/db/schema";

export const listStoreDevices = (storeId: number) =>
  db.query.storeDevicesTable.findMany({
    where: { store_id: storeId },
    orderBy: { id: "asc" },
  });

export const insertStoreDevice = (values: {
  store_id: number;
  name: string;
  label?: string;
}) => db.insert(storeDevicesTable).values(values).returning();

export const deleteStoreDevice = (storeId: number, deviceId: number) =>
  db
    .delete(storeDevicesTable)
    .where(
      and(
        eq(storeDevicesTable.id, deviceId),
        eq(storeDevicesTable.store_id, storeId)
      )
    )
    .returning();
