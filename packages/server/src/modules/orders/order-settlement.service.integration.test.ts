import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { campaignCodesTable, campaignsTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// A Repair's number from blank to settled, against a real Postgres. The gates
// are pinned by the unit suite beside this one; what needs real rows is
// everything downstream of them — the rollup that decides what is still owed,
// the bearer code leaving and re-entering circulation, and the shelf.

// Loaded after the swap above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database — and its module-level prepared
// statements would already be pointing at it.
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

// A listed promo the cashier ticks off the POS tile grid.
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

// A Voucher: one bearer code the customer carries in, worth 100.000 on an
// Order of at least 250.000.
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
    // Deep clean 100.000 plus a bag nobody has opened. The customer comes back
    // to collect and the cashier taps collect — the shop will not take the
    // 100.000 it already knows while the bag's number is still unknown.
    const order = await checkout({
      services: [shop.serviceId],
      withRepair: true,
    });

    const error = await captureRejection(collect(order.id));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order has an unpriced line — set its price before collecting payment"
    );
    expect((await readOrder(order.id))?.payment_status).toBe("unpaid");
  });

  it("turns the customer's voucher away rather than settle it on a guess", async () => {
    // The slip is in the bag with the items. Claiming it now would spend a
    // bearer code against a total nobody can compute yet, and inspection could
    // then put the Order under the voucher's minimum.
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
      "Order has an unpriced line — promotions wait until every item is priced"
    );
    expect((await readVoucherCode())?.redeemed_at).toBeNull();
  });

  it("settles the promo at the desk once the workshop has keyed the number", async () => {
    // The bag came back at 250.000, agreed over WhatsApp. Now every line has a
    // number, so the campaign base is the whole 350.000 and the promo can
    // finally settle — at payment, because it could not settle at drop-off.
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
    // The cashier keyed 210.000 for the repair at drop-off, the voucher settled
    // against a 310.000 Order, and the customer walked out with a Receipt
    // showing 100.000 off. Teardown then says 10.000 — a 110.000 Order holding
    // a "min 250.000" discount would leave the shop collecting 10.000.
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
    // Two pairs on one ticket, both dropped. The promo slot goes back to the
    // pool once — a release per voided line would credit the shop's remaining
    // stock of that promo twice and let a later customer over the cap.
    const campaign = await addListedCampaign();
    const order = await checkout({
      campaignIds: [campaign.id],
      services: [shop.serviceId, shop.serviceId],
    });

    // A second customer down the road holds a slot on the same promo, so a
    // double release shows up as their slot disappearing too.
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
    // The cashier adds two shoe trees, then three more as a separate tap. Five
    // leave the shelf — taking one line's word for it would sell stock the shop
    // does not have.
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
    // Ten in stock, six plus six on the tab. Checking each line on its own
    // would let both pass and leave the shelf at minus two.
    const error = await captureRejection(
      checkout({
        products: [
          { id: shop.productId, qty: 6 },
          { id: shop.productId, qty: 6 },
        ],
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Insufficient stock for product Shoe Tree"
    );
    expect(
      (
        await testDb.query.productsTable.findFirst({
          where: { id: shop.productId },
        })
      )?.stock
    ).toBe(10);
  });
});
