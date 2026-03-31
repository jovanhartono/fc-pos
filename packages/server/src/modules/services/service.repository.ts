import type { InferInsertModel } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { servicesTable } from "@/db/schema";

export function findServices(ids: number[]) {
  return db.query.servicesTable.findMany({
    where: { id: { in: ids } },
  });
}

export function listServices() {
  return db.query.servicesTable.findMany({
    orderBy: { id: "asc" },
    with: {
      category: true,
    },
  });
}

export function findServiceById(id: number) {
  return db.query.servicesTable.findFirst({
    where: { id },
  });
}

export function createService(values: InferInsertModel<typeof servicesTable>) {
  return db.insert(servicesTable).values(values).returning();
}

export function updateService(
  id: number,
  values: Partial<InferInsertModel<typeof servicesTable>>
) {
  return db
    .update(servicesTable)
    .set(values)
    .where(eq(servicesTable.id, id))
    .returning();
}
