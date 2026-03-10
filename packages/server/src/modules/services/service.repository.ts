import type { InferInsertModel } from "drizzle-orm";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { servicesTable } from "@/db/schema";

export function findServices(ids: number[]) {
  return db.query.servicesTable.findMany({
    where: (service, { inArray }) => inArray(service.id, ids),
  });
}

export function listServices() {
  return db.query.servicesTable.findMany({
    orderBy: [asc(servicesTable.id)],
    with: {
      category: true,
    },
  });
}

export function findServiceById(id: number) {
  return db.query.servicesTable.findFirst({
    where: eq(servicesTable.id, id),
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
