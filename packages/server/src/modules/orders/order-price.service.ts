import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderServicePriceLogsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import type { PatchOrderServicePriceInput } from "@/modules/orders/order-admin.schema";
import { getOrderStateOrThrow } from "@/modules/orders/order-read.repository";
import {
  assertLinePrice,
  revalidateSettledPromo,
} from "@/modules/orders/order-settlement.service";
import type { JWTPayload } from "@/types";

// Open to any staff on purpose (ADR-0018 / ADR-0004): whoever inspected the Item
// agrees the price with the Customer, often over WhatsApp. The price log is the check.
export async function setOrderServicePrice({
  orderId,
  serviceId,
  body,
  user,
}: {
  orderId: number;
  serviceId: number;
  body: PatchOrderServicePriceInput;
  user: JWTPayload;
}) {
  return await db.transaction(async (tx) => {
    const order = await getOrderStateOrThrow(tx, orderId);
    // Payment freezes prices (ADR-0018); a wrong price after that is a Refund.
    // This is only the friendly error; the guarded write below wins any race.
    if (order.payment_status === "paid") {
      throw new BadRequestException(
        "Order has been paid — its prices are frozen"
      );
    }

    const line = await tx.query.ordersServicesTable.findFirst({
      where: { order_id: orderId, id: serviceId },
      columns: { complaint_id: true, price: true, status: true },
    });
    if (!line) {
      throw new BadRequestException("Order service not found for this order");
    }

    // A Rework is free (ADR-0013), so its 0 is not a typo, even on an unpaid Order.
    if (line.complaint_id !== null) {
      throw new BadRequestException("A rework is free — its price is fixed");
    }

    // Nobody owes a cancelled line anything (ADR-0008).
    if (line.status === "cancelled") {
      throw new BadRequestException("Cannot set a price on a cancelled line");
    }

    assertLinePrice(body.price);

    const nextPrice = body.price.toString();

    // Re-checked in the write: while the workshop prices, the Customer may decline
    // (line cancelled) or a cashier may take payment, leaving a paid Order whose
    // lines don't add up to what was charged (ADR-0018).
    const [updated] = await tx
      .update(ordersServicesTable)
      .set({ price: nextPrice })
      .where(
        and(
          eq(ordersServicesTable.id, serviceId),
          ne(ordersServicesTable.status, "cancelled"),
          sql`exists (select 1 from ${ordersTable} where ${ordersTable.id} = ${orderId} and ${ordersTable.payment_status} = 'unpaid')`
        )
      )
      .returning({
        id: ordersServicesTable.id,
        price: ordersServicesTable.price,
      });

    if (!updated) {
      throw new BadRequestException(
        "The order was paid or this line was cancelled while you were pricing it. Refresh and try again."
      );
    }

    // This trail stands in for an approval step; from_price NULL means the line
    // was blank until now.
    await tx.insert(orderServicePriceLogsTable).values({
      order_service_id: serviceId,
      changed_by: user.id,
      from_price: line.price,
      to_price: nextPrice,
    });

    // A lowered price can drop the Order under its promo's minimum, or a 100k
    // discount would stay on a 160k Order.
    await revalidateSettledPromo(tx, orderId, user.id);

    return updated;
  });
}
