import "@/test-support/pglite";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import {
  campaignCodesTable,
  campaignsTable,
  paymentChargesTable,
  paymentMethodsTable,
} from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import type { DiscountRequest } from "@/modules/orders/order-settlement.service";
import type {
  GatewayChargeInput,
  GatewayChargeRef,
  GatewayNotification,
  PaymentGateway,
  PaymentGatewayName,
} from "@/modules/payments/gateways/types";
import { captureRejection } from "@/test-support/capture-rejection";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// A Gateway charge from the counter QRIS or the Track page to a paid Order, on
// real rows, with the gateway itself faked.

const gateway = {
  active: "midtrans" as PaymentGatewayName | null,
  cancelled: [] as GatewayChargeRef[],
  created: [] as GatewayChargeInput[],
  failCreate: false as boolean,
  notification: null as GatewayNotification | null,
};

const fakeGateway: PaymentGateway = {
  name: "midtrans",
  createCharge: (input) => {
    gateway.created.push(input);
    if (gateway.failCreate) {
      return Promise.reject(new Error("503 from gateway"));
    }
    return Promise.resolve({
      expiresAt: new Date(Date.now() + input.expiresInMinutes * 60_000),
      providerRef: `tx-${input.reference}`,
      qrImageUrl: input.kind === "qris" ? "https://qr.test/code.png" : null,
      redirectUrl: input.kind === "checkout" ? "https://pay.test/page" : null,
    });
  },
  getStatus: () =>
    Promise.resolve({ amount: null, raw: {}, status: "pending" }),
  cancelCharge: (ref) => {
    gateway.cancelled.push(ref);
    return Promise.resolve();
  },
  verifyNotification: () => Promise.resolve(gateway.notification),
};

mock.module("@/modules/payments/gateways", () => ({
  activePaymentGatewayName: () => gateway.active,
  getPaymentGateway: () => fakeGateway,
}));

const { createOrder } = await import("@/modules/orders/order.service");
const { updateOrderPayment } = await import(
  "@/modules/orders/order-payment.service"
);
const { payTrackedOrder } = await import(
  "@/modules/orders/order-track.service"
);
const {
  cancelOrderPendingCharges,
  createPaymentCharge,
  handlePaymentNotification,
} = await import("@/modules/payments/payment-charge.service");

let shop: Shop;
let gatewayMethodId: number;

const PHONE = "+628111222333";
const VOUCHER_CODE = "VIP12345";
const REFERENCE_FORMAT = /^FC-\d+-[a-z0-9]{8}$/;
const NO_DISCOUNT: DiscountRequest = {
  campaign_ids: [],
  discount: 0,
  voucher_codes: [],
};

const dropOff = (deepCleans = 1, withRepair = false) =>
  createOrder(shop.cashier.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: PHONE },
    discount: 0,
    items: [
      ...Array.from({ length: deepCleans }, () => ({
        services: [{ id: shop.serviceId }],
      })),
      ...(withRepair ? [{ services: [{ id: shop.repairServiceId }] }] : []),
    ],
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid" as const,
    products: [],
    store_id: shop.store.id,
    voucher_codes: [],
  });

const showQris = (orderId: number, request = NO_DISCOUNT) =>
  createPaymentCharge({
    createdBy: shop.cashier.id,
    kind: "qris",
    orderId,
    request,
  });

// The gateway's word that a charge was paid, as a verified notification.
const gatewaySays = (reference: string, amount: number) => {
  gateway.notification = {
    amount,
    raw: { reference },
    reference,
    status: "paid",
  };
  return handlePaymentNotification("midtrans", {
    headers: {},
    path: "/api/webhooks/payments/midtrans",
    rawBody: "{}",
  });
};

const readOrder = (orderId: number) =>
  testDb.query.ordersTable.findFirst({ where: { id: orderId } });

const readCharge = (id: number) =>
  testDb.query.paymentChargesTable.findFirst({ where: { id } });

const addVoucher = async () => {
  const [campaign] = await testDb
    .insert(campaignsTable)
    .values({
      code: "VIPLAUNCH",
      created_by: shop.admin.id,
      discount_type: "fixed",
      discount_value: "100000",
      min_order_total: "250000",
      name: "VIP launch",
      redemption_mode: "code",
      updated_by: shop.admin.id,
    })
    .returning();

  await testDb
    .insert(campaignCodesTable)
    .values({ campaign_id: campaign.id, code: VOUCHER_CODE });
};

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
  const [method] = await testDb
    .insert(paymentMethodsTable)
    .values({
      code: "MDTRNS",
      gateway: "midtrans",
      is_active: true,
      name: "Midtrans",
    })
    .returning();
  gatewayMethodId = method.id;

  gateway.active = "midtrans";
  gateway.cancelled = [];
  gateway.created = [];
  gateway.failCreate = false;
  gateway.notification = null;
});

describe("showing a QRIS at the counter", () => {
  it("asks the gateway for the Order's net due, valid 15 minutes", async () => {
    const order = await dropOff();

    const charge = await showQris(order.id);

    expect(charge).toMatchObject({
      amount: 100_000,
      kind: "qris",
      qr_image_url: "https://qr.test/code.png",
      status: "pending",
    });
    expect(charge.reference).toMatch(REFERENCE_FORMAT);
    expect(gateway.created[0]).toMatchObject({
      amount: 100_000,
      expiresInMinutes: 15,
      notificationUrl:
        "https://pos.fresclean.id/api/webhooks/payments/midtrans",
    });
  });

  it("is refused until the admin links a PaymentMethod to the gateway", async () => {
    await testDb
      .update(paymentMethodsTable)
      .set({ is_active: false })
      .where(eq(paymentMethodsTable.id, gatewayMethodId));
    const order = await dropOff();

    const error = await captureRejection(showQris(order.id));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Link a PaymentMethod to Midtrans first"
    );
  });

  it("is refused when online payment is switched off", async () => {
    gateway.active = null;
    const order = await dropOff();

    const error = await captureRejection(showQris(order.id));

    expect((error as Error).message).toBe("Online payment is not set up");
  });

  it("is refused while a Repair still has no price", async () => {
    const order = await dropOff(1, true);

    const error = await captureRejection(showQris(order.id));

    expect((error as Error).message).toBe(
      "Order has an unpriced line. Price it before collecting payment."
    );
    expect(gateway.created).toHaveLength(0);
  });

  it("is refused on an Order already paid in cash", async () => {
    const order = await dropOff();
    await updateOrderPayment({
      body: { ...NO_DISCOUNT, payment_method_id: shop.paymentMethodId },
      orderId: order.id,
      user: shop.cashier,
    });

    const error = await captureRejection(showQris(order.id));

    expect((error as Error).message).toBe("Order has already been paid");
  });

  it("cancels the QRIS shown before, here and at the gateway", async () => {
    const order = await dropOff();
    const first = await showQris(order.id);

    const second = await showQris(order.id);

    expect((await readCharge(first.id))?.status).toBe("cancelled");
    expect((await readCharge(second.id))?.status).toBe("pending");
    expect(gateway.cancelled.map((ref) => ref.reference)).toEqual([
      first.reference,
    ]);
  });

  it("marks the charge failed when the gateway does not answer", async () => {
    gateway.failCreate = true;
    const order = await dropOff();

    const error = await captureRejection(showQris(order.id));

    expect((error as Error).message).toBe(
      "Midtrans did not respond, try again"
    );
    const [charge] = await testDb.select().from(paymentChargesTable);
    expect(charge.status).toBe("failed");
  });
});

describe("the gateway confirming the money", () => {
  it("marks the Order paid with the gateway's PaymentMethod, by the cashier who showed the QR", async () => {
    const order = await dropOff();
    const charge = await showQris(order.id);

    expect(await gatewaySays(charge.reference, 100_000)).toBe(true);

    expect(await readOrder(order.id)).toMatchObject({
      paid_amount: "100000",
      paid_by: shop.cashier.id,
      payment_method_id: gatewayMethodId,
      payment_status: "paid",
    });
    expect(await readCharge(charge.id)).toMatchObject({ status: "paid" });
  });

  it("does nothing more when the same notification arrives twice", async () => {
    const order = await dropOff();
    const charge = await showQris(order.id);
    await gatewaySays(charge.reference, 100_000);
    const paidAt = (await readOrder(order.id))?.paid_at;

    await gatewaySays(charge.reference, 100_000);

    expect((await readCharge(charge.id))?.status).toBe("paid");
    expect((await readOrder(order.id))?.paid_at).toEqual(paidAt ?? null);
  });

  it("holds a payment for review when the amount paid differs", async () => {
    const order = await dropOff();
    const charge = await showQris(order.id);

    await gatewaySays(charge.reference, 90_000);

    expect(await readCharge(charge.id)).toMatchObject({
      review_reason: "Midtrans reported 90000 paid against a charge of 100000",
      status: "needs_review",
    });
    expect((await readOrder(order.id))?.payment_status).toBe("unpaid");
  });

  it("holds a payment for review when the Order was paid in cash meanwhile", async () => {
    // The Customer scanned the QR and also handed over cash: the shop has the
    // money twice, and a person has to give one back.
    const order = await dropOff();
    const charge = await showQris(order.id);
    await updateOrderPayment({
      body: { ...NO_DISCOUNT, payment_method_id: shop.paymentMethodId },
      orderId: order.id,
      user: shop.cashier,
    });

    await gatewaySays(charge.reference, 100_000);

    expect(await readCharge(charge.id)).toMatchObject({
      review_reason: "Order has already been paid",
      status: "needs_review",
    });
    expect((await readOrder(order.id))?.payment_method_id).toBe(
      shop.paymentMethodId
    );
  });

  it("answers for a reference it never issued without touching anything", async () => {
    expect(await gatewaySays("FC-999-unknown1", 100_000)).toBe(true);
  });

  it("refuses a notification whose signature does not match", async () => {
    gateway.notification = null;

    const verified = await handlePaymentNotification("midtrans", {
      headers: {},
      path: "/api/webhooks/payments/midtrans",
      rawBody: "{}",
    });

    expect(verified).toBe(false);
  });
});

describe("a Voucher code on a counter QRIS", () => {
  it("is spent only when the money arrives", async () => {
    await addVoucher();
    const order = await dropOff(3);

    const charge = await showQris(order.id, {
      ...NO_DISCOUNT,
      voucher_codes: [VOUCHER_CODE],
    });

    expect(charge.amount).toBe(200_000);
    const beforePaid = await testDb.query.campaignCodesTable.findFirst({
      where: { code: VOUCHER_CODE },
    });
    expect(beforePaid?.redeemed_at).toBeNull();

    await gatewaySays(charge.reference, 200_000);

    const afterPaid = await testDb.query.campaignCodesTable.findFirst({
      where: { code: VOUCHER_CODE },
    });
    expect(afterPaid?.redeemed_order_id).toBe(order.id);
    expect(await readOrder(order.id)).toMatchObject({
      discount: "100000",
      paid_amount: "200000",
    });
  });
});

describe("a Campaign on a counter QRIS", () => {
  it("holds the payment for review when an admin deletes the Campaign before the money arrives", async () => {
    const [campaign] = await testDb
      .insert(campaignsTable)
      .values({
        code: "OPENING",
        created_by: shop.admin.id,
        discount_type: "fixed",
        discount_value: "100000",
        name: "Opening week",
        updated_by: shop.admin.id,
      })
      .returning();
    const order = await dropOff(3);
    const charge = await showQris(order.id, {
      ...NO_DISCOUNT,
      campaign_ids: [campaign.id],
    });
    await testDb
      .delete(campaignsTable)
      .where(eq(campaignsTable.id, campaign.id));

    expect(await gatewaySays(charge.reference, 200_000)).toBe(true);

    expect(await readCharge(charge.id)).toMatchObject({
      review_reason: `Campaign not found: ${campaign.id}`,
      status: "needs_review",
    });
    expect((await readOrder(order.id))?.payment_status).toBe("unpaid");
  });
});

describe("Pay on the Track page", () => {
  it("sends the Customer back to the page they already opened", async () => {
    const order = await dropOff();
    const proof = { code: order.code, phone_number: PHONE };

    const first = await payTrackedOrder(proof);
    const second = await payTrackedOrder(proof);

    expect(second).toEqual(first);
    expect(gateway.created).toHaveLength(1);
    expect(gateway.created[0]).toMatchObject({
      expiresInMinutes: 1440,
      kind: "checkout",
    });
  });

  it("leaves paid_by empty and the last staff edit in place once paid", async () => {
    const order = await dropOff();
    await payTrackedOrder({ code: order.code, phone_number: PHONE });
    const [charge] = await testDb.select().from(paymentChargesTable);

    await gatewaySays(charge.reference, 100_000);

    expect(await readOrder(order.id)).toMatchObject({
      paid_by: null,
      payment_status: "paid",
      updated_by: shop.cashier.id,
    });
  });
});

describe("Mark as paid at the counter", () => {
  it("closes any QRIS still open for the Order", async () => {
    const order = await dropOff();
    const charge = await showQris(order.id);

    await cancelOrderPendingCharges(order.id);

    expect((await readCharge(charge.id))?.status).toBe("cancelled");
    expect(gateway.cancelled).toHaveLength(1);
  });
});
