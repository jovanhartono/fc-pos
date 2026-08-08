import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderServicePriceLogsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { getOrderServiceOrThrow } from "@/modules/orders/order.repository";
import type { PostOrderServiceEstimateConfirmInput } from "@/modules/orders/order-admin.schema";
import type { JWTPayload } from "@/types";

// Confirming an Estimate is deliberately open to any staff (ADR-0018 /
// ADR-0004): money still moves only through the POS, and gating something
// that happens on every Repair would jam the counter. The oversight is the
// price log this writes — estimate versus final, by user — which is what
// makes "is this cashier trained enough to quote?" measurable.
export async function confirmOrderServiceEstimate({
  orderId,
  serviceId,
  body,
  user,
}: {
  orderId: number;
  serviceId: number;
  body: PostOrderServiceEstimateConfirmInput;
  user: JWTPayload;
}) {
  const line = await getOrderServiceOrThrow(orderId, serviceId);

  if (line.estimated_price === null) {
    throw new BadRequestException("This line is not an Estimate");
  }
  if (line.estimate_confirmed_at !== null) {
    throw new BadRequestException("Estimate has already been confirmed");
  }
  // A cancelled line took the unpaid off-ramp (ADR-0008) — there is no money
  // on it left to settle.
  if (line.status === "cancelled") {
    throw new BadRequestException(
      "Cannot confirm an Estimate on a cancelled line"
    );
  }

  // Zero is not a settlement: price 0 means deliberately free (a Rework line,
  // ADR-0013). Inspection finding nothing to charge is a cancel, not a ₀ final.
  if (body.price <= 0) {
    throw new BadRequestException("Final price must be greater than zero");
  }

  const finalPrice = body.price;
  const intakePrice = Number(line.price ?? 0);

  return await db.transaction(async (tx) => {
    // Checked again here, inside the update. While the price was being typed,
    // another phone may have settled this bag, or the counter may have
    // cancelled it after the customer heard the quote. Either way the price
    // must not land.
    const [updated] = await tx
      .update(ordersServicesTable)
      .set({
        price: finalPrice.toString(),
        estimate_confirmed_at: new Date(),
      })
      .where(
        and(
          eq(ordersServicesTable.id, serviceId),
          isNull(ordersServicesTable.estimate_confirmed_at),
          ne(ordersServicesTable.status, "cancelled")
        )
      )
      .returning({
        id: ordersServicesTable.id,
        price: ordersServicesTable.price,
        estimated_price: ordersServicesTable.estimated_price,
        estimate_confirmed_at: ordersServicesTable.estimate_confirmed_at,
      });

    if (!updated) {
      throw new BadRequestException(
        "This line changed while you were pricing it — it was already confirmed, or cancelled. Refresh and try again."
      );
    }

    await tx.insert(orderServicePriceLogsTable).values({
      order_service_id: serviceId,
      changed_by: user.id,
      from_price: intakePrice.toString(),
      to_price: finalPrice.toString(),
    });

    // orders.total is the gross snapshot of its lines — the settled number
    // replaces the estimate in it, so the amount due at the counter is real.
    await tx
      .update(ordersTable)
      .set({
        total: sql`${ordersTable.total} + ${finalPrice - intakePrice}`,
        updated_by: user.id,
      })
      .where(eq(ordersTable.id, orderId));

    return updated;
  });
}
