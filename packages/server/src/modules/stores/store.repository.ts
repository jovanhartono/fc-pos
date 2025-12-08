import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storesTable } from "@/db/schema";

export function findStoreById(id: number) {
  return db.query.storesTable.findFirst({
    where: eq(storesTable.id, id),
  });
}
