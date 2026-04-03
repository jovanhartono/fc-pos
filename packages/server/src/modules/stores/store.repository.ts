import type { InferInsertModel } from "drizzle-orm";
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { storesTable } from "@/db/schema";

const findStoreByIdPrepared = db.query.storesTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_store_by_id");

export function findStoreById(id: number) {
  return findStoreByIdPrepared.execute({ id });
}

export function listStores() {
  return db.query.storesTable.findMany({
    orderBy: { id: "asc" },
  });
}

export function insertStore(values: InferInsertModel<typeof storesTable>) {
  return db.insert(storesTable).values(values).returning();
}

export function updateStoreById(
  id: number,
  values: Partial<InferInsertModel<typeof storesTable>>
) {
  return db
    .update(storesTable)
    .set(values)
    .where(eq(storesTable.id, id))
    .returning();
}

export function updateStoreIsActive(id: number, is_active: boolean) {
  return db
    .update(storesTable)
    .set({ is_active })
    .where(eq(storesTable.id, id))
    .returning();
}

export function findNearestStores({
  latitude,
  longitude,
  limit,
  radius_km,
  include_inactive,
}: {
  latitude: number;
  longitude: number;
  limit: number;
  radius_km?: number;
  include_inactive: boolean;
}) {
  const distanceExpr = sql<number>`
    6371 * ACOS(
      LEAST(
        1,
        GREATEST(
          -1,
          COS(RADIANS(${latitude})) *
          COS(RADIANS(CAST(${storesTable.latitude} AS DOUBLE PRECISION))) *
          COS(
            RADIANS(CAST(${storesTable.longitude} AS DOUBLE PRECISION)) -
            RADIANS(${longitude})
          ) +
          SIN(RADIANS(${latitude})) *
          SIN(RADIANS(CAST(${storesTable.latitude} AS DOUBLE PRECISION)))
        )
      )
    )
  `;

  const whereConditions: SQL[] = [];
  if (!include_inactive) {
    whereConditions.push(eq(storesTable.is_active, true));
  }
  if (radius_km !== undefined) {
    whereConditions.push(sql`${distanceExpr} <= ${radius_km}`);
  }

  const whereClause =
    whereConditions.length > 0 ? and(...whereConditions) : undefined;

  return db
    .select({
      id: storesTable.id,
      code: storesTable.code,
      name: storesTable.name,
      phone_number: storesTable.phone_number,
      address: storesTable.address,
      latitude: storesTable.latitude,
      longitude: storesTable.longitude,
      is_active: storesTable.is_active,
      created_at: storesTable.created_at,
      distance_km: distanceExpr,
    })
    .from(storesTable)
    .where(whereClause)
    .orderBy(asc(distanceExpr), asc(storesTable.id))
    .limit(limit);
}
