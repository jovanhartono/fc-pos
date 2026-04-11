import type { InferInsertModel } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { servicesTable } from "@/db/schema";

export function findServices(ids: number[]) {
  return db.query.servicesTable.findMany({
    where: { id: { in: ids } },
  });
}

export const LIST_SERVICES_MAX = 500;

export function listServices() {
  return db.query.servicesTable.findMany({
    orderBy: { id: "asc" },
    limit: LIST_SERVICES_MAX,
    with: {
      category: true,
    },
  });
}

const findServiceByIdPrepared = db.query.servicesTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_service_by_id");

export function findServiceById(id: number) {
  return findServiceByIdPrepared.execute({ id });
}

export function insertService(values: InferInsertModel<typeof servicesTable>) {
  return db.insert(servicesTable).values(values).returning();
}

export function updateServiceById(
  id: number,
  values: Partial<InferInsertModel<typeof servicesTable>>
) {
  return db
    .update(servicesTable)
    .set(values)
    .where(eq(servicesTable.id, id))
    .returning();
}
