import { eq } from "drizzle-orm";
import { db } from "@/db";
import { type IntakeChannel, ordersTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { assertCanCreateOrder } from "@/modules/permissions/permissions";
import { assertPostalCodeExists } from "@/modules/postal-codes/postal-code.service";
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

// A wrong courier breaks the accountability record and a wrong origin skews the
// data the shop picks its next storefront from, so both stay correctable. The
// three move together because the database refuses them apart (ADR-0020).
export async function updateOrderIntake({
  orderId,
  intakeChannel,
  collectedBy,
  originPostalCode,
  user,
}: {
  orderId: number;
  intakeChannel: IntakeChannel;
  collectedBy: number | null;
  originPostalCode: string | null;
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

  if (originPostalCode !== null) {
    await assertPostalCodeExists(originPostalCode);
  }

  const rows = await db
    .update(ordersTable)
    .set({
      collected_by: collectedBy,
      intake_channel: intakeChannel,
      origin_postal_code: originPostalCode,
      updated_by: user.id,
    })
    .where(eq(ordersTable.id, orderId))
    .returning({
      id: ordersTable.id,
      collected_by: ordersTable.collected_by,
      intake_channel: ordersTable.intake_channel,
      origin_postal_code: ordersTable.origin_postal_code,
    });

  return rows[0] ?? null;
}
