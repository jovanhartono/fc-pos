import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";

import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import { addItemPhoto, type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// Staff key a Repair's agreed price after inspection, or fix a typo while the
// Order is unpaid; once paid, prices are frozen (ADR-0018). On real rows: a
// Deep Clean (100.000) dropped off with a Repair nobody has priced yet.

const { db } = await import("@/db");
const { createOrder } = await import("@/modules/orders/order.service");
const { updateOrderPayment } =
  await import("@/modules/orders/order-payment.service");
const { setOrderServicePrice } =
  await import("@/modules/orders/order-price.service");
const { cancelOrder } = await import("@/modules/orders/order-reversal.service");
const { transitionOrderService } =
  await import("@/modules/orders/order-status-machine");
const { openComplaint } =
  await import("@/modules/complaints/complaint.service");

let shop: Shop;

const dropOff = () =>
  createOrder(shop.cashier.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    delivery_fee: 0,
    discount: 0,
    items: [
      { services: [{ id: shop.serviceId }] },
      { services: [{ id: shop.repairServiceId }] },
    ],
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    products: [],
    store_id: shop.store.id,
    voucher_codes: [],
  });

const repairLineOf = async (orderId: number) => {
  const line = await testDb.query.ordersServicesTable.findFirst({
    where: { order_id: orderId, service_id: shop.repairServiceId },
  });
  if (!line) {
    throw new Error(`Order ${orderId} has no Repair line`);
  }
  return line;
};

const readOrder = (orderId: number) =>
  testDb.query.ordersTable.findFirst({ where: { id: orderId } });

const priceLogsOf = (serviceId: number) =>
  testDb.query.orderServicePriceLogsTable.findMany({
    where: { order_service_id: serviceId },
    orderBy: { id: "asc" },
  });

const price = (orderId: number, serviceId: number, amount: number) =>
  setOrderServicePrice({
    body: { price: amount },
    orderId,
    serviceId,
    user: shop.cashier,
  });

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

describe("pricing a Repair after inspection", () => {
  it("puts the first number on a blank line and logs who did", async () => {
    const order = await dropOff();
    const repair = await repairLineOf(order.id);

    const updated = await price(order.id, repair.id, 150_000);

    expect(updated).toEqual({ id: repair.id, price: "150000" });
    expect(await priceLogsOf(repair.id)).toMatchObject([
      { changed_by: shop.cashier.id, from_price: null, to_price: "150000" },
    ]);
  });

  it("refreshes the Order total so the counter asks for the agreed number", async () => {
    const order = await dropOff();
    const repair = await repairLineOf(order.id);

    await price(order.id, repair.id, 150_000);

    expect((await readOrder(order.id))?.total).toBe("250000");
  });

  it("corrects a priced line while unpaid, keeping the from→to trail", async () => {
    const order = await dropOff();
    const repair = await repairLineOf(order.id);
    await price(order.id, repair.id, 150_000);

    await price(order.id, repair.id, 180_000);

    expect(await priceLogsOf(repair.id)).toMatchObject([
      { from_price: null, to_price: "150000" },
      { from_price: "150000", to_price: "180000" },
    ]);
    expect((await readOrder(order.id))?.total).toBe("280000");
  });

  it("refuses any price change once the Order is paid", async () => {
    const order = await dropOff();
    const repair = await repairLineOf(order.id);
    await price(order.id, repair.id, 150_000);
    await updateOrderPayment({
      body: {
        campaign_ids: [],
        discount: 0,
        payment_method_id: shop.paymentMethodId,
        voucher_codes: [],
      },
      orderId: order.id,
      user: shop.cashier,
    });

    const error = await captureRejection(price(order.id, repair.id, 90_000));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order has been paid — its prices are frozen"
    );
    expect((await repairLineOf(order.id)).price).toBe("150000");
  });

  it("refuses to price a cancelled line, since nobody owes its number", async () => {
    const order = await dropOff();
    const repair = await repairLineOf(order.id);
    await cancelOrder({
      body: {
        items: [{ order_service_id: repair.id, reason: "customer_request" }],
      },
      orderId: order.id,
      user: shop.cashier,
    });

    const error = await captureRejection(price(order.id, repair.id, 150_000));

    expect((error as Error).message).toBe(
      "Cannot set a price on a cancelled line"
    );
    expect(await priceLogsOf(repair.id)).toEqual([]);
  });

  it("refuses to price a Rework on an Order still unpaid at the counter", async () => {
    // The Customer turned the Item down before paying; its Rework line is free.
    const order = await dropOff();
    const clean = await testDb.query.ordersServicesTable.findFirst({
      where: { order_id: order.id, service_id: shop.serviceId },
    });
    if (!clean?.item_id) {
      throw new Error("Deep Clean line missing");
    }
    await addItemPhoto(clean.item_id, shop.cashier.id);
    for (const to of [
      "processing",
      "waiting_qc",
      "ready_for_pickup",
    ] as const) {
      await transitionOrderService(db, {
        by: shop.cashier.id,
        orderId: order.id,
        serviceId: clean.id,
        to,
      });
    }
    const { rework } = await openComplaint({
      body: {
        order_service_id: clean.id,
        reason: "Sole still stained",
        start_rework: true,
      },
      user: shop.cashier,
    });

    const error = await captureRejection(
      price(order.id, rework?.id ?? 0, 50_000)
    );

    expect((error as Error).message).toBe(
      "A rework is free — its price is fixed"
    );
  });

  it("refuses zero: 0 means deliberately free, which is a Rework", async () => {
    const order = await dropOff();
    const repair = await repairLineOf(order.id);

    const error = await captureRejection(price(order.id, repair.id, 0));

    expect((error as Error).message).toBe("Price must be greater than zero");
    expect((await repairLineOf(order.id)).price).toBeNull();
  });

  it("refuses a line that belongs to another Order", async () => {
    const order = await dropOff();
    const other = await dropOff();
    const repair = await repairLineOf(other.id);

    const error = await captureRejection(price(order.id, repair.id, 150_000));

    expect((error as Error).message).toBe(
      "Order service not found for this order"
    );
    expect((await repairLineOf(other.id)).price).toBeNull();
  });
});
