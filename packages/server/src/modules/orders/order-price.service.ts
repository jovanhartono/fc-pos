import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderServicePriceLogsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { voidCampaignsBelowMinimum } from "@/modules/campaigns/campaign-redemption.service";
import { getOrderServiceOrThrow } from "@/modules/orders/order.repository";
import type { PatchOrderServicePriceInput } from "@/modules/orders/order-admin.schema";
import { recomputeOrderRollup } from "@/modules/orders/order-status-machine";
import type { JWTPayload } from "@/types";

// Setting a line's price is deliberately open to any staff (ADR-0018 /
// ADR-0004): the number is agreed with the customer — usually over WhatsApp,
// by whoever inspected the Item — and money still moves only through the POS.
// The oversight is the price log this writes: who put which number on which
// Item, from what.
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
  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { payment_status: true },
  });
  if (!order) {
    throw new BadRequestException("Order not found");
  }
  // Payment froze the numbers (ADR-0018): the customer paid against a printed
  // receipt and the till matches it. A wrong price after that is a refund.
  // This read is only the friendly answer for the ordinary case — the guarded
  // write below is what actually loses a race against the counter.
  if (order.payment_status === "paid") {
    throw new BadRequestException(
      "Order has been paid — its prices are frozen"
    );
  }

  const line = await getOrderServiceOrThrow(orderId, serviceId);

  // A cancelled line took the unpaid off-ramp (ADR-0008) — nobody owes its
  // number anymore, so there is nothing left to price.
  if (line.status === "cancelled") {
    throw new BadRequestException("Cannot set a price on a cancelled line");
  }

  // Zero is not a price: 0 means deliberately free — a Rework line
  // (ADR-0013), decided at intake, never keyed here.
  if (body.price <= 0) {
    throw new BadRequestException("Price must be greater than zero");
  }

  const nextPrice = body.price.toString();

  return await db.transaction(async (tx) => {
    // Re-checked inside the write, because the counter moves while the
    // workshop still has the pricing screen open: the customer may have heard
    // the number and declined (line cancelled — that price must not land on a
    // line nobody owes), or another cashier may have collected payment (a
    // correction landing after that would leave a PAID order whose line
    // prices don't sum to what was charged — the state ADR-0018 exists to
    // make impossible).
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

    // Every set-or-correct leaves a row; from_price NULL means the line was
    // blank until now. This trail is what stands in for an approval gate.
    await tx.insert(orderServicePriceLogsTable).values({
      order_service_id: serviceId,
      changed_by: user.id,
      from_price: line.price,
      to_price: nextPrice,
    });

    // orders.total is a snapshot of its billable lines — refresh it so the
    // amount due at the counter reflects the number just agreed.
    await recomputeOrderRollup(tx, orderId, user.id);

    // A promo may already have settled on this unpaid Order (ADR-0018): every
    // line was priced, the discount printed on the Receipt. Correcting a price
    // downward can drop the Order under the minimum that promo was granted
    // against, so the same check the cancel path runs has to run here too —
    // otherwise "correct the repair to 10k" is a way to keep a 100k fixed
    // discount on a 160k Order.
    const rolled = await tx.query.ordersTable.findFirst({
      where: { id: orderId },
      columns: { total: true },
    });
    await voidCampaignsBelowMinimum(tx, orderId, Number(rolled?.total ?? 0));

    return updated;
  });
}
