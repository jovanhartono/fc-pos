import "@/test-support/pglite";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  campaignEligibleServicesTable,
  campaignsTable,
  itemImagesTable,
} from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import { addItemPhoto, type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// The counter SOP against a real Postgres: the cashier shows the customer the
// finished pair before handing it over, and the customer turns it down there
// and then. The complaint lands on a line that is still ready_for_pickup, the
// pair goes back to the workshop, and it leaves only once the re-clean is done.

const STORAGE_ENV_PREFIX = "dev/";

const { assertPhotoKeyUnder, newPhotoKey } = await import("@/utils/s3");

mock.module("@/utils/s3", () => ({
  STORAGE_ENV_PREFIX,
  assertPhotoKeyUnder,
  buildMediaUrl: (path: string | null) =>
    path ? `https://cdn.test/${path}` : null,
  createPresignedUploadUrl: ({ key }: { key: string }) => ({
    expires_in_seconds: 300,
    key,
    upload_url: `https://s3.test/${key}`,
  }),
  newPhotoKey,
  optimizeUploadedImage: () => Promise.resolve(),
}));

// Loaded after both swaps above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database and the real storage module.
const { db } = await import("@/db");
const { addRework, listComplaints, openComplaint } = await import(
  "@/modules/complaints/complaint.service"
);
const { createOrder, getOrderDetailById } = await import(
  "@/modules/orders/order.service"
);
const { createOrderPickupEvent } = await import(
  "@/modules/orders/order-pickup.service"
);
const { getOrderServiceQueue } = await import(
  "@/modules/orders/order-queue.service"
);
const { getOrderServiceDetail } = await import(
  "@/modules/orders/order-service-detail.service"
);
const { updateOrderPayment } = await import(
  "@/modules/orders/order-payment.service"
);
const { cancelOrder, createOrderRefund } = await import(
  "@/modules/orders/order-reversal.service"
);
const { transitionOrderService } = await import(
  "@/modules/orders/order-status-machine"
);

let shop: Shop;

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

// One pair in for a deep clean, walked through the workshop to the shelf.
const pairOnTheShelf = async (paymentStatus: "paid" | "unpaid") => {
  const order = await createOrder(shop.admin.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    items: [{ services: [{ id: shop.serviceId }] }],
    payment_method_id: shop.paymentMethodId,
    payment_status: paymentStatus,
    store_id: shop.store.id,
    voucher_codes: [],
  });
  const item = await testDb.query.itemsTable.findFirst({
    where: { order_id: order.id },
  });
  const line = await testDb.query.ordersServicesTable.findFirst({
    where: { order_id: order.id },
  });
  const stored = await testDb.query.ordersTable.findFirst({
    where: { id: order.id },
  });
  if (!(item && line && stored)) {
    throw new Error("Order has no item or service line");
  }
  await addItemPhoto(item.id, shop.cashier.id);
  await walkToShelf(order.id, line.id);

  return {
    itemId: item.id,
    lineId: line.id,
    orderId: order.id,
    pickupCode: stored.pickup_code,
  };
};

const walkToShelf = async (orderId: number, serviceId: number) => {
  for (const to of [
    "processing",
    "quality_check",
    "ready_for_pickup",
  ] as const) {
    await transitionOrderService(db, {
      by: shop.cashier.id,
      orderId,
      serviceId,
      to,
    });
  }
};

const turnDown = (lineId: number, startRework: boolean) =>
  openComplaint({
    user: shop.cashier,
    body: {
      order_service_id: lineId,
      reason: "Sole still stained",
      start_rework: startRework,
    },
  });

const handOver = (pair: {
  itemId: number;
  orderId: number;
  pickupCode: string;
}) =>
  createOrderPickupEvent({
    orderId: pair.orderId,
    body: {
      image_path: `${STORAGE_ENV_PREFIX}orders/${pair.orderId}/pickup/proof.webp`,
      item_ids: [pair.itemId],
      pickup_code: pair.pickupCode,
    },
    user: shop.cashier,
  });

// The returned pair photographed at the counter. Dated a second after the
// complaint: the gate compares to the millisecond, and two inserts inside one
// test can share one.
const photographReturnedPair = (itemId: number, complaintAt: Date) =>
  testDb.insert(itemImagesTable).values({
    created_at: new Date(complaintAt.getTime() + 1000),
    image_path: `dev/orders/items/${itemId}/returned.webp`,
    item_id: itemId,
    uploaded_by: shop.cashier.id,
  });

const readLines = (orderId: number) =>
  testDb.query.ordersServicesTable.findMany({
    where: { order_id: orderId },
    orderBy: { id: "asc" },
  });

describe("a pair turned down at the counter", () => {
  it("goes back for a rework and leaves only with it, both lines picked up", async () => {
    const pair = await pairOnTheShelf("paid");

    const { complaint, rework } = await turnDown(pair.lineId, true);
    if (!rework) {
      throw new Error("Complaint opened without its rework");
    }

    // The rework holds the pair back: you cannot hand back half a shoe.
    const whileReworking = await getOrderDetailById(pair.orderId);
    expect(whileReworking?.items[0].is_collectable).toBe(false);
    const early = await captureRejection(handOver(pair));
    expect(early).toBeInstanceOf(BadRequestException);
    expect((early as Error).message).toContain("Items not ready for pickup");

    // The first visit's photo says nothing about the state it came back in.
    const unphotographed = await captureRejection(
      transitionOrderService(db, {
        by: shop.cashier.id,
        orderId: pair.orderId,
        serviceId: rework.id,
        to: "processing",
      })
    );
    expect((unphotographed as Error).message).toBe(
      "Add a photo of the returned item before starting the rework"
    );

    await photographReturnedPair(pair.itemId, complaint.created_at);
    await walkToShelf(pair.orderId, rework.id);

    const event = await handOver(pair);

    const lines = await readLines(pair.orderId);
    expect(lines.map((line) => [line.id, line.status])).toEqual([
      [pair.lineId, "picked_up"],
      [rework.id, "picked_up"],
    ]);
    expect(lines.every((line) => line.pickup_event_id === event.id)).toBe(true);
  });

  it("records who put the rework on the rack, and when", async () => {
    const pair = await pairOnTheShelf("paid");

    const { complaint, rework } = await turnDown(pair.lineId, true);

    const logs = await testDb.query.orderServiceStatusLogsTable.findMany({
      where: { order_service_id: rework?.id },
    });
    expect(logs).toMatchObject([
      {
        changed_by: shop.cashier.id,
        created_at: complaint.created_at,
        from_status: null,
        note: `Rework for complaint #${complaint.id}`,
        to_status: "queued",
      },
    ]);
  });

  it("links the rework and the turned-down line to each other on every screen", async () => {
    const pair = await pairOnTheShelf("paid");
    const { complaint, rework } = await turnDown(pair.lineId, true);
    if (!rework) {
      throw new Error("Complaint opened without its rework");
    }

    const queueDetail = await getOrderServiceDetail(pair.orderId, rework.id);
    expect(queueDetail?.line.reworkOf).toMatchObject({
      id: complaint.id,
      openedBy: { name: "Cahya Cashier" },
      orderService: {
        id: pair.lineId,
        pickupEvent: null,
        service: { name: "Deep Clean" },
      },
      reason: "Sole still stained",
      reworkLines: [{ id: rework.id }],
    });

    const detail = await getOrderDetailById(pair.orderId);
    const original = detail?.items[0].services.find(
      (line) => line.id === pair.lineId
    );
    expect(original?.complaints).toMatchObject([
      {
        id: complaint.id,
        reworkLines: [
          {
            id: rework.id,
            statusLogs: [{ changedBy: { name: "Cahya Cashier" } }],
          },
        ],
      },
    ]);

    const rack = await getOrderServiceQueue(shop.cashier, {
      store_id: shop.store.id,
    });
    expect(
      rack.items[0].services.map((line) => [line.id, line.is_rework])
    ).toEqual([
      [pair.lineId, false],
      [rework.id, true],
    ]);

    // ADR-0016: the claim code stays on the printed receipt only.
    expect(JSON.stringify([queueDetail, detail])).not.toContain("pickup_code");
  });

  it("still takes payment before the pair leaves, the free rework blocking nothing", async () => {
    const pair = await pairOnTheShelf("unpaid");
    const { rework } = await turnDown(pair.lineId, true);
    if (!rework) {
      throw new Error("Complaint opened without its rework");
    }

    const paid = await updateOrderPayment({
      body: {
        campaign_ids: [],
        discount: 0,
        payment_method_id: shop.paymentMethodId,
        voucher_codes: [],
      },
      orderId: pair.orderId,
      user: shop.cashier,
    });
    expect(paid?.paid_amount).toBe("100000");

    const order = await testDb.query.ordersTable.findFirst({
      where: { id: pair.orderId },
    });
    expect(order?.total).toBe("100000");
  });

  it("keeps a second-pair-free promo whole when one pair is back for a rework", async () => {
    // Two pairs on one ticket, one turned down at the counter. The free
    // re-clean is not a pair the customer bought, so it must not take the
    // promo's free slot and leave them paying for both.
    const order = await createOrder(shop.admin.id, shop.store, {
      campaign_ids: [],
      customer: { name: "Budi Santoso", phone_number: "+628111222333" },
      discount: 0,
      items: [
        { services: [{ id: shop.serviceId }] },
        { services: [{ id: shop.serviceId }] },
      ],
      payment_method_id: shop.paymentMethodId,
      payment_status: "unpaid",
      store_id: shop.store.id,
      voucher_codes: [],
    });
    const [line] = await readLines(order.id);
    await addItemPhoto(line.item_id, shop.cashier.id);
    await walkToShelf(order.id, line.id);
    await turnDown(line.id, true);

    const [campaign] = await testDb
      .insert(campaignsTable)
      .values({
        buy_quantity: 1,
        code: "PAIR2FREE",
        created_by: shop.admin.id,
        discount_type: "buy_n_get_m_free",
        free_quantity: 1,
        name: "Second pair free",
        updated_by: shop.admin.id,
      })
      .returning();
    await testDb
      .insert(campaignEligibleServicesTable)
      .values({ campaign_id: campaign.id, service_id: shop.serviceId });

    const paid = await updateOrderPayment({
      body: {
        campaign_ids: [campaign.id],
        discount: 0,
        payment_method_id: shop.paymentMethodId,
        voucher_codes: [],
      },
      orderId: order.id,
      user: shop.cashier,
    });

    expect(paid?.paid_amount).toBe("100000");
  });

  it("refuses the pickup of an unpaid Order even once the rework is done", async () => {
    const pair = await pairOnTheShelf("unpaid");
    const { complaint, rework } = await turnDown(pair.lineId, true);
    if (!rework) {
      throw new Error("Complaint opened without its rework");
    }
    await photographReturnedPair(pair.itemId, complaint.created_at);
    await walkToShelf(pair.orderId, rework.id);

    const error = await captureRejection(handOver(pair));

    expect((error as Error).message).toBe("Order must be paid before pickup");
  });

  it("can still refund the ready line instead, and then takes no further rework", async () => {
    const pair = await pairOnTheShelf("paid");
    const { complaint } = await turnDown(pair.lineId, false);

    const result = await createOrderRefund({
      body: {
        items: [{ order_service_id: pair.lineId, reason: "damaged" }],
      },
      orderId: pair.orderId,
      user: shop.admin,
    });

    expect(result.total_refund_amount).toBe(100_000);
    const [line] = await readLines(pair.orderId);
    expect(line.status).toBe("refunded");

    const error = await captureRejection(
      addRework({ user: shop.cashier, complaintId: complaint.id })
    );
    expect(error).toBeInstanceOf(BadRequestException);
  });
});

describe("the original line cancelled or refunded while its rework is on the rack", () => {
  const rackFor = () =>
    getOrderServiceQueue(shop.cashier, { store_id: shop.store.id });

  it("cancels the rework with the original on an unpaid Order", async () => {
    const pair = await pairOnTheShelf("unpaid");
    const { rework } = await turnDown(pair.lineId, true);
    if (!rework) {
      throw new Error("Complaint opened without its rework");
    }

    await cancelOrder({
      body: {
        items: [{ order_service_id: pair.lineId, reason: "customer_request" }],
      },
      orderId: pair.orderId,
      user: shop.cashier,
    });

    const [, reworkLine] = await readLines(pair.orderId);
    expect(reworkLine).toMatchObject({
      cancel_note: "Original line cancelled",
      cancel_reason: "other",
      status: "cancelled",
    });
    const logs = await testDb.query.orderServiceStatusLogsTable.findMany({
      where: { order_service_id: rework.id, to_status: "cancelled" },
    });
    expect(logs).toMatchObject([
      {
        changed_by: shop.cashier.id,
        from_status: "queued",
        note: "Original line cancelled",
      },
    ]);
    expect((await rackFor()).items).toEqual([]);
    const detail = await getOrderDetailById(pair.orderId);
    expect(detail?.status).toBe("cancelled");
    expect(detail?.items[0].is_collectable).toBe(false);
  });

  it("cancels the rework when the original is refunded on a paid Order, and the pair can go home", async () => {
    const pair = await pairOnTheShelf("paid");
    const { complaint, rework } = await turnDown(pair.lineId, true);
    if (!rework) {
      throw new Error("Complaint opened without its rework");
    }
    await photographReturnedPair(pair.itemId, complaint.created_at);
    await transitionOrderService(db, {
      by: shop.cashier.id,
      orderId: pair.orderId,
      serviceId: rework.id,
      to: "processing",
    });

    await createOrderRefund({
      body: { items: [{ order_service_id: pair.lineId, reason: "damaged" }] },
      orderId: pair.orderId,
      user: shop.admin,
    });

    const lines = await readLines(pair.orderId);
    expect(lines.map((line) => [line.status, line.cancel_note])).toEqual([
      ["refunded", null],
      ["cancelled", "Original line refunded"],
    ]);
    expect((await rackFor()).items).toEqual([]);
    const detail = await getOrderDetailById(pair.orderId);
    expect(detail?.items[0].is_collectable).toBe(true);
  });

  it("keeps the rework of a pair brought back after pickup running through a refund, and it goes home once", async () => {
    const pair = await pairOnTheShelf("paid");
    await handOver(pair);
    const { complaint, rework } = await turnDown(pair.lineId, true);
    if (!rework) {
      throw new Error("Complaint opened without its rework");
    }
    await photographReturnedPair(pair.itemId, complaint.created_at);
    await transitionOrderService(db, {
      by: shop.cashier.id,
      orderId: pair.orderId,
      serviceId: rework.id,
      to: "processing",
    });

    await createOrderRefund({
      body: { items: [{ order_service_id: pair.lineId, reason: "damaged" }] },
      orderId: pair.orderId,
      user: shop.admin,
    });

    const [, reworkLine] = await readLines(pair.orderId);
    expect(reworkLine.status).toBe("processing");

    for (const to of ["quality_check", "ready_for_pickup"] as const) {
      await transitionOrderService(db, {
        by: shop.cashier.id,
        orderId: pair.orderId,
        serviceId: rework.id,
        to,
      });
    }
    const ready = await getOrderDetailById(pair.orderId);
    expect(ready?.items[0].is_collectable).toBe(true);

    const event = await handOver(pair);

    const lines = await readLines(pair.orderId);
    expect(
      lines.map((line) => [line.status, line.pickup_event_id === event.id])
    ).toEqual([
      ["refunded", false],
      ["picked_up", true],
    ]);
    const home = await getOrderDetailById(pair.orderId);
    expect(home?.items[0].is_collectable).toBe(false);
  });
});

describe("one rework round at a time", () => {
  const addRound = (complaintId: number) =>
    addRework({ user: shop.cashier, complaintId });

  it("refuses a second round until the first has gone home with the pair", async () => {
    const pair = await pairOnTheShelf("paid");
    const { complaint, rework } = await turnDown(pair.lineId, true);
    if (!rework) {
      throw new Error("Complaint opened without its rework");
    }

    const whileQueued = await captureRejection(addRound(complaint.id));
    expect((whileQueued as Error).message).toBe(
      "Finish the current rework before starting another"
    );

    await photographReturnedPair(pair.itemId, complaint.created_at);
    await walkToShelf(pair.orderId, rework.id);
    const whileReady = await captureRejection(addRound(complaint.id));
    expect(whileReady).toBeInstanceOf(BadRequestException);

    await handOver(pair);
    const second = await addRound(complaint.id);

    const lines = await readLines(pair.orderId);
    expect(lines.map((line) => [line.id, line.status])).toEqual([
      [pair.lineId, "picked_up"],
      [rework.id, "picked_up"],
      [second.id, "queued"],
    ]);
  });
});

describe("the complaint's outcome", () => {
  it("does not read Reworked when its only rework was cancelled", async () => {
    const pair = await pairOnTheShelf("unpaid");
    const { rework } = await turnDown(pair.lineId, true);
    if (!rework) {
      throw new Error("Complaint opened without its rework");
    }

    await cancelOrder({
      body: {
        items: [{ order_service_id: rework.id, reason: "customer_request" }],
      },
      orderId: pair.orderId,
      user: shop.cashier,
    });

    const { items } = await listComplaints(shop.admin);
    expect(items.map((row) => [row.subject_status, row.rework_count])).toEqual([
      ["ready_for_pickup", 0],
    ]);
  });
});
