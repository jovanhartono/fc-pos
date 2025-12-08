import { db } from "@/db";

export function findServices(ids: number[]) {
  return db.query.servicesTable.findMany({
    where: (service, { inArray }) => inArray(service.id, ids),
  });
}
