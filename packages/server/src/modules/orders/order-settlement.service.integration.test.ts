import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { campaignCodesTable, campaignsTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// A Repair from unpriced to settled on real rows: what is still owed, and a
// Voucher code being spent and handed back.

// Imported after the swap above: a static import would bind the shop's real
// database, prepared statements included, before the swap runs.
const { createOrder } = await import("@/modules/orders/order.service");
const { updateOrderPayment } = await import(
  "@/modules/orders/order-payment.service"
);
const { setOrderServicePrice } = await import(
  "@/modules/orders/order-price.service"
);
const { cancelOrder } = await import("@/modules/orders/order-reversal.service");

let shop: Shop;

const VOUCHER_CODE = "VIP12345";

interface CheckoutOptions {
  campaignIds?: number[];
  products?: { id: number; qty: number }[];
  repairPrice?: number;
  services?: number[];
  voucherCodes?: string[];
  withRepair?: boolean;
}

const checkout = ({
  campaignIds = [],
  products = [],
  repairPrice,
  services = [],
  voucherCodes = [],
  withRepair = false,
}: CheckoutOptions) =>
  createOrder(shop.cashier.id, shop.store, {
    campaign_ids: campaignIds,
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    items: [
      ...services.map((id) => ({ services: [{ id }] })),
      ...(withRepair
        ? [
            {
              services: [{ id: shop.repairServiceId, price: repairPrice }],
            },
          ]
        : []),
    ],
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid" as const,
    products,
    store_id: shop.store.id,
    voucher_codes: voucherCodes,
  });

const collect = (orderId: number, over: Partial<CheckoutOptions> = {}) =>
  updateOrderPayment({
    body: {
      campaign_ids: over.campaignIds ?? [],
      discount: 0,
      payment_method_id: shop.paymentMethodId,
      voucher_codes: over.voucherCodes ?? [],
    },
    orderId,
    user: shop.cashier,
  });

const serviceLines = (orderId: number) =>
  testDb.query.ordersServicesTable.findMany({
    where: { order_id: orderId },
    columns: { id: true, price: true, service_id: true },
    orderBy: { id: "asc" },
  });

const readOrder = (orderId: number) =>
  testDb.query.ordersTable.findFirst({ where: { id: orderId } });

const readCampaign = (campaignId: number) =>
  testDb.query.campaignsTable.findFirst({ where: { id: campaignId } });

const readVoucherCode = () =>
  testDb.query.campaignCodesTable.findFirst({ where: { code: VOUCHER_CODE } });

const addListedCampaign = async () => {
  const [campaign] = await testDb
    .insert(campaignsTable)
    .values({
      code: "KMG30",
      created_by: shop.admin.id,
      discount_type: "fixed",
      discount_value: "30000",
      min_order_total: "0",
      name: "Thirty off",
      updated_by: shop.admin.id,
      usage_limit: 5,
    })
    .returning();

  return campaign;
};

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

  return campaign;
};

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

describe("a Repair that still needs inspecting", () => {
  it("takes no money for the Order at all until its number is agreed", async () => {
    // Deep clean plus an uninspected Repair: the shop won't take the known
    // 100.000 while the Repair's price is still unknown.
    const order = await checkout({
      services: [shop.serviceId],
      withRepair: true,
    });

    const error = await captureRejection(collect(order.id));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order has an unpriced line. Price it before collecting payment."
    );
    expect((await readOrder(order.id))?.payment_status).toBe("unpaid");
  });

  it("turns the customer's voucher away rather than settle it on a guess", async () => {
    // Spending the code now bets on a total nobody knows; inspection could then
    // put the Order under the Voucher's minimum.
    await addVoucher();

    const error = await captureRejection(
      checkout({
        services: [shop.serviceId],
        voucherCodes: [VOUCHER_CODE],
        withRepair: true,
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order has an unpriced line. Add discounts once every line is priced."
    );
    expect((await readVoucherCode())?.redeemed_at).toBeNull();
  });

  it("settles the promo at the desk once the workshop has keyed the number", async () => {
    // The Repair is agreed at 250.000 over WhatsApp, so the Campaign settles on
    // the whole 350.000 at payment, since it could not at drop-off.
    const campaign = await addListedCampaign();
    const order = await checkout({
      services: [shop.serviceId],
      withRepair: true,
    });
    const [, repairLine] = await serviceLines(order.id);

    await setOrderServicePrice({
      body: { price: 250_000 },
      orderId: order.id,
      serviceId: repairLine.id,
      user: shop.cashier,
    });

    const paid = await collect(order.id, { campaignIds: [campaign.id] });

    expect(paid?.paid_amount).toBe("320000");
    const settled = await readOrder(order.id);
    expect(settled?.total).toBe("350000");
    expect(settled?.discount).toBe("30000");
    expect(settled?.discount_source).toBe("campaign");
    expect((await readCampaign(campaign.id))?.redeemed_count).toBe(1);
  });
});

describe("a price corrected downward", () => {
  it("voids the printed promo and puts the voucher code back in circulation", async () => {
    // The Repair was keyed at 210.000 and the Voucher settled on 310.000;
    // inspection says 10.000, and a 110.000 Order can't keep a min-250.000 discount.
    await addVoucher();
    const order = await checkout({
      repairPrice: 210_000,
      services: [shop.serviceId],
      voucherCodes: [VOUCHER_CODE],
      withRepair: true,
    });

    expect((await readOrder(order.id))?.discount).toBe("100000");
    expect((await readVoucherCode())?.redeemed_at).not.toBeNull();

    const [, repairLine] = await serviceLines(order.id);
    await setOrderServicePrice({
      body: { price: 10_000 },
      orderId: order.id,
      serviceId: repairLine.id,
      user: shop.cashier,
    });

    const corrected = await readOrder(order.id);
    expect(corrected?.total).toBe("110000");
    expect(corrected?.discount).toBe("0");
    expect(corrected?.discount_source).toBe("none");
    expect((await readVoucherCode())?.redeemed_at).toBeNull();
    expect(
      await testDb.query.orderCampaignsTable.findMany({
        where: { order_id: order.id },
      })
    ).toEqual([]);
  });
});

describe("cancelling every line", () => {
  it("hands the campaign slot back exactly once, however many lines were voided", async () => {
    // Two Items on one Order, both cancelled: one release per Line would hand
    // back the Usage limit twice and let a later Customer over the cap.
    const campaign = await addListedCampaign();
    const order = await checkout({
      campaignIds: [campaign.id],
      services: [shop.serviceId, shop.serviceId],
    });

    // A second Customer holds a slot too, so a double release shows up here.
    await checkout({
      campaignIds: [campaign.id],
      services: [shop.serviceId],
    });
    expect((await readCampaign(campaign.id))?.redeemed_count).toBe(2);

    const lines = await serviceLines(order.id);
    await cancelOrder({
      body: {
        items: lines.map((line) => ({
          order_service_id: line.id,
          reason: "customer_request" as const,
        })),
      },
      orderId: order.id,
      user: shop.cashier,
    });

    expect((await readOrder(order.id))?.status).toBe("cancelled");
    expect((await readCampaign(campaign.id))?.redeemed_count).toBe(1);
  });
});

describe("a retail-only sale", () => {
  it("takes both lines of the same shoe tree off the shelf", async () => {
    // Two shoe trees, then three more as a separate tap: five leave the shelf.
    const order = await checkout({
      products: [
        { id: shop.productId, qty: 2 },
        { id: shop.productId, qty: 3 },
      ],
    });

    expect(order.total).toBe("250000");
    expect(
      (
        await testDb.query.productsTable.findFirst({
          where: { id: shop.productId },
        })
      )?.stock
    ).toBe(5);
  });

  it("refuses the sale when the two lines together outrun the shelf", async () => {
    // Ten in stock, six plus six in the Cart: checked line by line, both pass
    // and the shelf goes to minus two.
    const error = await captureRejection(
      checkout({
        products: [
          { id: shop.productId, qty: 6 },
          { id: shop.productId, qty: 6 },
        ],
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Not enough stock for Shoe Tree");
    expect(
      (
        await testDb.query.productsTable.findFirst({
          where: { id: shop.productId },
        })
      )?.stock
    ).toBe(10);
  });
});
