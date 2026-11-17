import type { InferInsertModel } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { servicesTable } from "@/db/schema";

export const findServices = (ids: number[]) =>
  db.query.servicesTable.findMany({
    where: { id: { in: ids } },
  });

export const LIST_SERVICES_MAX = 500;

export const listServices = () =>
  db.query.servicesTable.findMany({
    orderBy: { id: "asc" },
    limit: LIST_SERVICES_MAX,
    with: {
      category: true,
    },
  });

const findServiceByIdPrepared = db.query.servicesTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_service_by_id");

export const findServiceById = (id: number) =>
  findServiceByIdPrepared.execute({ id });

export const insertService = (values: InferInsertModel<typeof servicesTable>) =>
  db.insert(servicesTable).values(values).returning();

export const updateServiceById = (
  id: number,
  values: Partial<InferInsertModel<typeof servicesTable>>
) =>
  db
    .update(servicesTable)
    .set(values)
    .where(eq(servicesTable.id, id))
    .returning();
