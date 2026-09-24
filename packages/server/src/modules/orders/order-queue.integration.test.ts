import "@/test-support/pglite";
import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { categoriesTable, servicesTable } from "@/db/schema";
import { addItemPhoto, type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// The artisan and the deep cleaners work at different speeds, so each reads
// the rack split by Category: "Repair only" or "everything except Repair".
// A shoe carrying both kinds of work has to be on both racks, or one of the two
// workers never learns it is waiting for them.

// Loaded after the swap above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database.
const { db } = await import("@/db");
const { createOrder } = await import("@/modules/orders/order.service");
const { getOrderServiceQueue, getOrderServiceQueueCounts } = await import(
  "@/modules/orders/order-queue.service"
);
const { transitionOrderService } = await import(
  "@/modules/orders/order-status-machine"
);

let shop: Shop;
let repairCategoryId: number;

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();

  const [repairCategory] = await testDb
    .insert(categoriesTable)
    .values({ is_active: true, name: "Repair" })
    .returning();
  repairCategoryId = repairCategory.id;
  await testDb
    .update(servicesTable)
    .set({ category_id: repairCategoryId })
    .where(eq(servicesTable.id, shop.repairServiceId));

  await createOrder(shop.cashier.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    items: [
      { brand: "clean only", services: [{ id: shop.serviceId }] },
      { brand: "repair only", services: [{ id: shop.repairServiceId }] },
      {
        brand: "clean and repair",
        services: [{ id: shop.serviceId }, { id: shop.repairServiceId }],
      },
    ],
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    store_id: shop.store.id,
    voucher_codes: [],
  });
});

const rack = async (category_mode: "only" | "except") => {
  const page = await getOrderServiceQueue(shop.admin, {
    category_id: repairCategoryId,
    category_mode,
    store_id: shop.store.id,
  });
  return {
    brands: page.items.map((item) => item.brand).sort(),
    total: page.meta.total,
  };
};

it("puts only Items with a repair on the artisan's rack", async () => {
  expect(await rack("only")).toEqual({
    brands: ["clean and repair", "repair only"],
    total: 2,
  });
});

it("keeps Items with any non-repair work on the cleaners' rack", async () => {
  expect(await rack("except")).toEqual({
    brands: ["clean and repair", "clean only"],
    total: 2,
  });
});

it("still lists every live Service on a card that qualified for the rack", async () => {
  const page = await getOrderServiceQueue(shop.admin, {
    category_id: repairCategoryId,
    category_mode: "except",
    store_id: shop.store.id,
  });
  const both = page.items.find((item) => item.brand === "clean and repair");

  expect(both?.services.map((service) => service.service_name).sort()).toEqual([
    "Deep Clean",
    "Repair",
  ]);
});

it("counts the chips over the same rack the list shows", async () => {
  const counts = await getOrderServiceQueueCounts(shop.admin, {
    category_id: repairCategoryId,
    category_mode: "only",
    store_id: shop.store.id,
  });

  expect(counts.all).toBe(2);
  expect(counts.queued).toBe(2);
});

it("lists only the jobs in the picked status on each card", async () => {
  // The artisan starts the repair on the pair that is also in for a clean. A
  // worker on "Queued" should see the clean waiting, not the repair already
  // in hand — and "All" still shows both.
  const pair = await testDb.query.itemsTable.findFirst({
    where: { brand: "clean and repair" },
    with: { services: true },
  });
  const repair = pair?.services.find(
    (line) => line.service_id === shop.repairServiceId
  );
  if (!(pair && repair)) {
    throw new Error("Fixture pair is missing its repair line");
  }
  await addItemPhoto(pair.id, shop.cashier.id);
  await transitionOrderService(db, {
    by: shop.cashier.id,
    orderId: pair.order_id,
    serviceId: repair.id,
    to: "processing",
  });

  const jobsOnPair = async (status?: "queued" | "processing") => {
    const page = await getOrderServiceQueue(shop.admin, {
      status,
      store_id: shop.store.id,
    });
    return page.items
      .find((item) => item.id === pair.id)
      ?.services.map((line) => `${line.service_name} ${line.status}`);
  };

  expect(await jobsOnPair("queued")).toEqual(["Deep Clean queued"]);
  expect(await jobsOnPair("processing")).toEqual(["Repair processing"]);
  expect(await jobsOnPair()).toEqual([
    "Deep Clean queued",
    "Repair processing",
  ]);

  // The chips still count cards: the pair is one card under each chip.
  const counts = await getOrderServiceQueueCounts(shop.admin, {
    store_id: shop.store.id,
  });
  expect(counts.queued).toBe(3);
  expect(counts.processing).toBe(1);
});

it("shows the whole Store when no Category is picked", async () => {
  const page = await getOrderServiceQueue(shop.admin, {
    store_id: shop.store.id,
  });
  const counts = await getOrderServiceQueueCounts(shop.admin, {
    store_id: shop.store.id,
  });

  expect(page.meta.total).toBe(3);
  expect(counts.all).toBe(3);
});
