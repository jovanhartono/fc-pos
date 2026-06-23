import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { BadRequestException } from "@/errors";
import { assertCanCreateOrder } from "@/modules/permissions/permissions";
import { findUserById } from "@/modules/users/user.repository";
import type { JWTPayload } from "@/types";

export async function assertActiveCourier(courierId: number) {
  const courier = await findUserById(courierId);
  if (courier?.role !== "courier" || !courier.is_active) {
    throw new BadRequestException(
      "collected_by must reference an active courier"
    );
  }
}

export async function updateOrderCollectedBy({
  orderId,
  collectedBy,
  user,
}: {
  orderId: number;
  collectedBy: number | null;
  user: JWTPayload;
}) {
  assertCanCreateOrder(user);

  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { id: true },
  });

  if (!order) {
    return null;
  }

  if (collectedBy !== null) {
    await assertActiveCourier(collectedBy);
  }

  const rows = await db
    .update(ordersTable)
    .set({
      collected_by: collectedBy,
      updated_by: user.id,
    })
    .where(eq(ordersTable.id, orderId))
    .returning({
      id: ordersTable.id,
      collected_by: ordersTable.collected_by,
    });

  return rows[0] ?? null;
}
