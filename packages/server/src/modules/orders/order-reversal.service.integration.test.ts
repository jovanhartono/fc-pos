import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { campaignsTable, ordersTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// The reversal desk end to end. The fake-based suite beside this one pins the
// arithmetic; here the caps are read back off real rows, so what a refund
// leaves behind — the line's own state, the Order rollup, the money columns —
// is the shop's schema answering rather than a double agreeing with itself.

// Loaded after the swap above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database — and its module-level prepared
// statements would already be pointing at it.
const { db } = await import("@/db");
const { claimRedemptions } = await import(
  "@/modules/campaigns/campaign-redemption.service"
);
const { createOrder } = await import("@/modules/orders/order.service");
const { cancelOrder, createOrderRefund } = await import(
  "@/modules/orders/order-reversal.service"
);

let shop: Shop;

// Deep Clean 100.000 plus one Shoe Tree 50.000, so a 30.000 discount splits
// 20.000 / 10.000 across the two lines and every cap is a whole rupiah.
const placeOrder = (
  over: { discount?: number; payment_status?: "paid" | "unpaid" } = {}
) =>
  createOrder(shop.admin.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: over.discount ?? 0,
    items: [{ services: [{ id: shop.serviceId }] }],
    payment_method_id: shop.paymentMethodId,
    payment_status: over.payment_status ?? "paid",
    products: [{ id: shop.productId, qty: 1 }],
    store_id: shop.store.id,
    voucher_codes: [],
  });

const lineIds = async (orderId: number) => {
  const [services, products] = await Promise.all([
    testDb.query.ordersServicesTable.findMany({
      where: { order_id: orderId },
      columns: { id: true },
    }),
    testDb.query.ordersProductsTable.findMany({
      where: { order_id: orderId },
      columns: { id: true },
    }),
  ]);

  return { productId: products[0].id, serviceId: services[0].id };
};

const readOrder = (orderId: number) =>
  testDb.query.ordersTable.findFirst({ where: { id: orderId } });

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

describe("refund", () => {
  it("takes the line's share of the order discount off the cash it hands back", async () => {
    const order = await placeOrder({ discount: 30_000 });
    const { serviceId } = await lineIds(order.id);

    const result = await createOrderRefund({
      orderId: order.id,
      body: { items: [{ order_service_id: serviceId, reason: "damaged" }] },
      user: shop.admin,
    });

    expect(result.total_refund_amount).toBe(80_000);
    expect((await readOrder(order.id))?.refunded_amount).toBe("80000");
  });

  it("refuses a second refund of the same treatment", async () => {
    const order = await placeOrder({ discount: 30_000 });
    const { serviceId } = await lineIds(order.id);
    const body = {
      items: [{ order_service_id: serviceId, reason: "damaged" as const }],
    };

    await createOrderRefund({ orderId: order.id, body, user: shop.admin });

    const error = await captureRejection(
      createOrderRefund({ orderId: order.id, body, user: shop.admin })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      `Order service ${serviceId} has no refundable amount remaining`
    );
    expect((await readOrder(order.id))?.refunded_amount).toBe("80000");
  });

  it("refuses a second refund of the same product", async () => {
    const order = await placeOrder({ discount: 30_000 });
    const { productId } = await lineIds(order.id);
    const body = {
      items: [{ order_product_id: productId, reason: "damaged" as const }],
    };

    await createOrderRefund({ orderId: order.id, body, user: shop.admin });

    const error = await captureRejection(
      createOrderRefund({ orderId: order.id, body, user: shop.admin })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      `Order product ${productId} has no refundable amount remaining`
    );
    expect((await readOrder(order.id))?.refunded_amount).toBe("40000");
  });
});

describe("cancel", () => {
  it("puts a campaign redemption back when the whole order is voided", async () => {
    const [campaign] = await testDb
      .insert(campaignsTable)
      .values({
        code: "KMG30",
        created_by: shop.admin.id,
        discount_type: "fixed",
        discount_value: "30000",
        name: "Thirty off",
        updated_by: shop.admin.id,
        usage_limit: 5,
      })
      .returning();

    const order = await placeOrder({ payment_status: "unpaid" });
    const { productId, serviceId } = await lineIds(order.id);

    // The promo is attached the way the checkout desk attaches it. Known
    // defect: campaign eligibility reads outside the order transaction; the
    // settlement refactor threads the executor, then this attaches the promo
    // through createOrder.
    await db.transaction(async (tx) => {
      await claimRedemptions(
        tx,
        [
          {
            applied_amount: "30000",
            buy_quantity: null,
            campaign_id: campaign.id,
            discount_type: "fixed",
            discount_value: "30000",
            free_quantity: null,
            kind: "listed",
            max_discount: null,
          },
        ],
        order.id
      );
      await tx
        .update(ordersTable)
        .set({ discount: "30000", discount_source: "campaign" })
        .where(eq(ordersTable.id, order.id));
    });

    expect(
      (
        await testDb.query.campaignsTable.findFirst({
          where: { id: campaign.id },
        })
      )?.redeemed_count
    ).toBe(1);

    await cancelOrder({
      orderId: order.id,
      body: {
        items: [
          { order_service_id: serviceId, reason: "customer_request" },
          { order_product_id: productId, reason: "customer_request" },
        ],
      },
      user: shop.cashier,
    });

    expect((await readOrder(order.id))?.status).toBe("cancelled");
    expect(
      (
        await testDb.query.campaignsTable.findFirst({
          where: { id: campaign.id },
        })
      )?.redeemed_count
    ).toBe(0);
  });
});
