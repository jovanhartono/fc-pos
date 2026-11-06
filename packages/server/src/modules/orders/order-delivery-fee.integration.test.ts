import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { campaignsTable, ordersTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { jakartaDayOf } from "@/modules/reports/report-range.util";
import { captureRejection } from "@/test-support/capture-rejection";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// ADR-0029 on real rows: a Customer far away pays Rp 25.000 for the Courier or
// GoSend trips on top of a Deep Clean (100.000) and a Shoe Tree (50.000).

// Imported after the swap above: a static import would bind the shop's real
// database, prepared statements included, before the swap runs.
const { createOrder, getOrderDetailById } = await import(
  "@/modules/orders/order.service"
);
const { updateOrderPayment } = await import(
  "@/modules/orders/order-payment.service"
);
const { updateOrderDeliveryFee } = await import(
  "@/modules/orders/order-delivery-fee.service"
);
const { cancelOrder, createOrderRefund } = await import(
  "@/modules/orders/order-reversal.service"
);
const { findOrders } = await import("@/modules/orders/order.repository");
const { getTrackedOrder } = await import(
  "@/modules/orders/order-track.service"
);
const { getDayClose } = await import("@/modules/counter/day-close.service");
const { findCustomerSummary } = await import(
  "@/modules/customers/customer.repository"
);

let shop: Shop;

const FEE = 25_000;
const PHONE = "+628111222333";

const placeOrder = (
  over: {
    campaign_ids?: number[];
    delivery_fee?: number;
    discount?: number;
    payment_status?: "paid" | "unpaid";
  } = {}
) =>
  createOrder(shop.cashier.id, shop.store, {
    campaign_ids: over.campaign_ids ?? [],
    customer: { name: "Budi Santoso", phone_number: PHONE },
    delivery_fee: over.delivery_fee ?? FEE,
    discount: over.discount ?? 0,
    items: [{ services: [{ id: shop.serviceId }] }],
    payment_method_id: shop.paymentMethodId,
    payment_status: over.payment_status ?? "paid",
    products: [{ id: shop.productId, qty: 1 }],
    store_id: shop.store.id,
    voucher_codes: [],
  });

const readOrder = async (orderId: number) => {
  const order = await testDb.query.ordersTable.findFirst({
    where: { id: orderId },
  });
  if (!order) {
    throw new Error(`Order ${orderId} missing`);
  }
  return order;
};

const collect = (orderId: number) =>
  updateOrderPayment({
    body: {
      campaign_ids: [],
      discount: 0,
      payment_method_id: shop.paymentMethodId,
      voucher_codes: [],
    },
    orderId,
    user: shop.cashier,
  });

const refundEveryLine = async (orderId: number) => {
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
  return createOrderRefund({
    orderId,
    body: {
      items: [
        ...services.map((line) => ({
          order_service_id: line.id,
          reason: "damaged" as const,
        })),
        ...products.map((line) => ({
          order_product_id: line.id,
          reason: "damaged" as const,
        })),
      ],
    },
    user: shop.admin,
  });
};

const addCampaign = async (values: {
  discount_type: "fixed" | "percentage";
  discount_value: string;
  min_order_total: string;
}) => {
  const [campaign] = await testDb
    .insert(campaignsTable)
    .values({
      ...values,
      code: "FEETEST",
      created_by: shop.admin.id,
      name: "Fee test",
      updated_by: shop.admin.id,
    })
    .returning();
  return campaign;
};

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

describe("checkout", () => {
  it("books the fee on top of the Lines when the Customer pays at drop-off", async () => {
    const order = await placeOrder();
    const row = await readOrder(order.id);

    expect(row.total).toBe("150000");
    expect(row.delivery_fee).toBe("25000");
    expect(row.paid_amount).toBe("175000");
  });

  it("stores no fee for a walk-in Order", async () => {
    const order = await placeOrder({ delivery_fee: 0 });
    const row = await readOrder(order.id);

    expect(row.delivery_fee).toBe("0");
    expect(row.paid_amount).toBe("150000");
  });

  it("adds the fee after a manual discount, which never eats into it", async () => {
    const order = await placeOrder({ discount: 200_000 });
    const row = await readOrder(order.id);

    // The discount clamps at the Lines' 150.000; the trips still cost 25.000.
    expect(row.discount).toBe("150000");
    expect(row.paid_amount).toBe("25000");
  });

  it("collects the fee with the Lines when the Order is paid later", async () => {
    const order = await placeOrder({ payment_status: "unpaid" });
    expect((await readOrder(order.id)).paid_amount).toBe("0");

    await collect(order.id);

    expect((await readOrder(order.id)).paid_amount).toBe("175000");
  });
});

describe("Campaigns never see the fee", () => {
  it("takes a percentage off the Lines only", async () => {
    const campaign = await addCampaign({
      discount_type: "percentage",
      discount_value: "10",
      min_order_total: "0",
    });
    const order = await placeOrder({ campaign_ids: [campaign.id] });
    const row = await readOrder(order.id);

    expect(row.discount).toBe("15000");
    expect(row.paid_amount).toBe("160000");
  });

  it("does not let the fee lift an Order over a Campaign's minimum", async () => {
    // 150.000 of Lines plus 25.000 of fee is 175.000, but the minimum is 160.000.
    const campaign = await addCampaign({
      discount_type: "fixed",
      discount_value: "20000",
      min_order_total: "160000",
    });

    const error = await captureRejection(
      placeOrder({ campaign_ids: [campaign.id] })
    );

    expect(error).toBeInstanceOf(BadRequestException);
  });
});

describe("Refunds never return the fee", () => {
  it("hands back every Line but keeps the fee, and calls it a full refund", async () => {
    const order = await placeOrder();

    const refund = await refundEveryLine(order.id);
    const row = await readOrder(order.id);

    expect(refund.total_refund_amount).toBe(150_000);
    expect(row.refunded_amount).toBe("150000");
    expect(Number(row.paid_amount) - Number(row.refunded_amount)).toBe(FEE);
    expect((await getOrderDetailById(order.id))?.refund_status).toBe("full");
  });

  it("lists the fully refunded delivered Order under Full, not Partial", async () => {
    const order = await placeOrder();
    await refundEveryLine(order.id);

    const list = (refund_status: "partial" | "full") =>
      findOrders({
        limit: 10,
        offset: 0,
        refund_status,
        sort_by: "created_at",
        sort_order: "desc",
      });

    expect((await list("full")).items.map((o) => o.id)).toEqual([order.id]);
    expect((await list("partial")).items).toEqual([]);
  });

  it("calls one Line refunded a partial refund", async () => {
    const order = await placeOrder();
    const products = await testDb.query.ordersProductsTable.findMany({
      where: { order_id: order.id },
    });
    await createOrderRefund({
      orderId: order.id,
      body: {
        items: [{ order_product_id: products[0].id, reason: "damaged" }],
      },
      user: shop.admin,
    });

    expect((await getOrderDetailById(order.id))?.refund_status).toBe("partial");
  });

  it("leaves the fee in the Customer's Lifetime spend", async () => {
    const order = await placeOrder();
    await refundEveryLine(order.id);
    const row = await readOrder(order.id);

    const summary = await findCustomerSummary(row.customer_id);

    expect(Number(summary.lifetime_spend)).toBe(FEE);
  });
});

describe("changing the fee after drop-off", () => {
  it("lets the counter set it while the Order is unpaid", async () => {
    const order = await placeOrder({
      delivery_fee: 0,
      payment_status: "unpaid",
    });

    const updated = await updateOrderDeliveryFee({
      orderId: order.id,
      deliveryFee: 40_000,
      user: shop.cashier,
    });

    expect(updated?.delivery_fee).toBe("40000");
    await collect(order.id);
    expect((await readOrder(order.id)).paid_amount).toBe("190000");
  });

  it("clears it back to nothing", async () => {
    const order = await placeOrder({ payment_status: "unpaid" });

    await updateOrderDeliveryFee({
      orderId: order.id,
      deliveryFee: 0,
      user: shop.cashier,
    });

    expect((await readOrder(order.id)).delivery_fee).toBe("0");
  });

  it("freezes it once the Order is paid", async () => {
    const order = await placeOrder();

    const error = await captureRejection(
      updateOrderDeliveryFee({
        orderId: order.id,
        deliveryFee: 40_000,
        user: shop.cashier,
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order has been paid — its Delivery fee is frozen"
    );
    expect((await readOrder(order.id)).delivery_fee).toBe("25000");
  });

  it("refuses a cancelled Order", async () => {
    const order = await placeOrder({ payment_status: "unpaid" });
    const [services, products] = await Promise.all([
      testDb.query.ordersServicesTable.findMany({
        where: { order_id: order.id },
      }),
      testDb.query.ordersProductsTable.findMany({
        where: { order_id: order.id },
      }),
    ]);
    await cancelOrder({
      orderId: order.id,
      body: {
        items: [
          {
            order_service_id: services[0].id,
            reason: "customer_request",
          },
          {
            order_product_id: products[0].id,
            reason: "customer_request",
          },
        ],
      },
      user: shop.cashier,
    });

    const error = await captureRejection(
      updateOrderDeliveryFee({
        orderId: order.id,
        deliveryFee: 40_000,
        user: shop.cashier,
      })
    );

    expect((error as Error).message).toBe(
      "Cannot set a Delivery fee on a cancelled order"
    );
    expect((await readOrder(order.id)).delivery_fee).toBe("0");
  });

  it("answers nothing for an Order that doesn't exist", async () => {
    expect(
      await updateOrderDeliveryFee({
        orderId: 999_999,
        deliveryFee: 40_000,
        user: shop.cashier,
      })
    ).toBe(null);
  });

  it("refuses a negative fee at the database too", async () => {
    const order = await placeOrder({ payment_status: "unpaid" });

    const error = await captureRejection(
      testDb
        .update(ordersTable)
        .set({ delivery_fee: "-1" })
        .where(eq(ordersTable.id, order.id))
    );

    expect(error).toBeInstanceOf(Error);
  });
});

describe("what the Customer and the cashier see", () => {
  it("asks the Customer for the fee on the Track page", async () => {
    const order = await placeOrder({ payment_status: "unpaid" });
    const { code } = await readOrder(order.id);

    const tracked = await getTrackedOrder({ code, phone_number: PHONE });

    expect(tracked.net_due).toBe(175_000);
    expect(tracked.delivery_fee).toBe("25000");
  });

  it("counts the fee in the Day close money and the drop-off list", async () => {
    const order = await placeOrder();
    const today = jakartaDayOf(new Date());

    const close = await getDayClose(shop.store.id, today);
    const dropped = close.dropped_off.order_list.find(
      (row) => row.order_id === order.id
    );

    expect(close.collected.amount).toBe(175_000);
    expect(dropped?.amount).toBe(175_000);
  });
});
