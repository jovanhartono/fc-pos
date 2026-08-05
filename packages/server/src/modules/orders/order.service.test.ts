import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";
import { ordersTable } from "@/db/schema";
import { BadRequestException } from "@/errors";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";
import type { Store } from "@/types/entity";

// createOrder is the counter checkout in a single transaction: the daily order
// number, the customer record, price/COGS snapshots, retail stock, the discount
// desk, voucher burns, and the final paid/unpaid money state commit — or roll
// back — together. These tests pin that orchestration: which gates fire before
// an order number is consumed, and what lands on the order row.
// Every collaborator seam (repositories, customer resolution, discount desk,
// redemption claims, courier check, authorization) is doubled — each has its
// own contract pinned elsewhere. The checkout logic itself stays real.

type AnyObj = Record<string, unknown>;

interface CatalogService {
  cogs: string;
  id: number;
  is_active: boolean;
  is_priority: boolean;
  price: string;
}

interface CatalogProduct {
  cogs: string;
  id: number;
  is_active: boolean;
  name: string;
  price: string;
}

const catalog = {
  products: [] as CatalogProduct[],
  services: [] as CatalogService[],
};

const repo = {
  sequence: 1,
  reserveCalls: [] as { tx: unknown; storeCode: string; dateStr: string }[],
  orderId: 501,
  insertedOrder: undefined as AnyObj | undefined,
  serviceRows: [] as AnyObj[],
  productRows: [] as AnyObj[],
  findOrdersCalls: [] as { filters: AnyObj; scopedStoreIds?: number[] }[],
};

const stock = {
  calls: [] as { productId: number; qty: number }[],
  emptyFor: new Set<number>(),
};

const customers = { calls: [] as AnyObj[], id: 77 };

const discount = {
  calls: [] as AnyObj[],
  result: {
    campaignRows: [] as AnyObj[],
    discountAmount: 0,
    discountSource: "none",
  },
};

const redemptions = {
  calls: [] as { tx: unknown; rows: unknown; orderId: number }[],
};

const courier = { calls: [] as number[] };

const authz = {
  assertCalls: [] as { userId: number; storeId: number }[],
  listCalls: [] as number[],
  storeIds: [] as number[],
};

const finalize = { writes: [] as { table: unknown; set: AnyObj }[] };

const detail = { row: undefined as AnyObj | undefined };

// The one direct tx use in createOrder is the finalizing money write on the
// order row; everything else reaches the tx through doubled repositories.
const TX = {
  update: (table: unknown) => ({
    set: (set: AnyObj) => {
      finalize.writes.push({ table, set });
      return { where: () => Promise.resolve() };
    },
  }),
};

// Real repositories create prepared statements at import time, so the fake db
// must let any db.query.<table>.findFirst/findMany chain into .prepare() — and
// still resolve when awaited (getOrderDetailById reads the order this way).
const relationalQuery = (first: () => unknown) => ({
  findFirst: () =>
    Object.assign(Promise.resolve().then(first), {
      prepare: () => ({ execute: () => Promise.resolve(undefined) }),
    }),
  findMany: () =>
    Object.assign(Promise.resolve([] as unknown[]), {
      prepare: () => ({ execute: () => Promise.resolve([]) }),
    }),
});

mock.module("@/db", () => ({
  db: {
    transaction: (cb: (tx: unknown) => unknown) => cb(TX),
    query: new Proxy(
      {},
      {
        get: (_target, tableName) =>
          relationalQuery(() =>
            tableName === "ordersTable" ? detail.row : undefined
          ),
      }
    ),
  },
}));

mock.module("@/utils/authorization", () => ({
  assertStoreAccess: (user: { id: number }, storeId: number) => {
    authz.assertCalls.push({ userId: user.id, storeId });
    return Promise.resolve();
  },
  getUserStoreIds: (userId: number) => {
    authz.listCalls.push(userId);
    return Promise.resolve(authz.storeIds);
  },
  assertOrderAccess: () => Promise.resolve({ id: 0, store_id: 0 }),
}));

// Capture the real modules before stubbing so afterAll can hand them back to
// test files that exercise them for real (their own suites pin the internals).
const actualOrderRepository = {
  ...(await import("@/modules/orders/order.repository")),
};
const actualCustomerService = {
  ...(await import("@/modules/customers/customer.service")),
};
const actualRedemptionService = {
  ...(await import("@/modules/campaigns/campaign-redemption.service")),
};
const actualCourierService = {
  ...(await import("@/modules/orders/order-courier.service")),
};
const actualDiscountService = {
  ...(await import("@/modules/orders/order-discount.service")),
};
const actualProductRepository = {
  ...(await import("@/modules/products/product.repository")),
};
const actualServiceRepository = {
  ...(await import("@/modules/services/service.repository")),
};

mock.module("@/modules/orders/order.repository", () => ({
  ...actualOrderRepository,
  reserveNextOrderNumber: (tx: unknown, storeCode: string, dateStr: string) => {
    repo.reserveCalls.push({ tx, storeCode, dateStr });
    return Promise.resolve(repo.sequence);
  },
  insertOrder: (_tx: unknown, values: AnyObj) => {
    repo.insertedOrder = values;
    return Promise.resolve(repo.orderId);
  },
  // Mirrors the DB's generated subtotal: price per garment, price × qty per
  // retail line — so the gross total under test is what a live checkout sums.
  insertOrderServices: (_tx: unknown, rows: AnyObj[]) => {
    repo.serviceRows = rows;
    return Promise.resolve(
      rows.reduce((sum, row) => sum + Number(row.price), 0)
    );
  },
  insertOrderProducts: (_tx: unknown, rows: AnyObj[]) => {
    repo.productRows = rows;
    return Promise.resolve(
      rows.reduce((sum, row) => sum + Number(row.price) * Number(row.qty), 0)
    );
  },
  findOrders: (filters: AnyObj, scopedStoreIds?: number[]) => {
    repo.findOrdersCalls.push({ filters, scopedStoreIds });
    return Promise.resolve({ items: [], total: 0 });
  },
}));

mock.module("@/modules/customers/customer.service", () => ({
  ...actualCustomerService,
  resolveOrCreateCustomer: (input: AnyObj) => {
    customers.calls.push(input);
    return Promise.resolve(customers.id);
  },
}));

mock.module("@/modules/campaigns/campaign-redemption.service", () => ({
  ...actualRedemptionService,
  claimRedemptions: (tx: unknown, rows: unknown, orderId: number) => {
    redemptions.calls.push({ tx, rows, orderId });
    return Promise.resolve();
  },
}));

mock.module("@/modules/orders/order-courier.service", () => ({
  ...actualCourierService,
  assertActiveCourier: (courierId: number) => {
    courier.calls.push(courierId);
    return Promise.resolve();
  },
}));

mock.module("@/modules/orders/order-discount.service", () => ({
  ...actualDiscountService,
  resolveDiscount: (input: AnyObj) => {
    discount.calls.push(input);
    return Promise.resolve(discount.result);
  },
}));

mock.module("@/modules/products/product.repository", () => ({
  ...actualProductRepository,
  findProducts: (ids: number[]) =>
    Promise.resolve(catalog.products.filter((p) => ids.includes(p.id))),
  decrementProductStock: (_tx: unknown, productId: number, qty: number) => {
    stock.calls.push({ productId, qty });
    return Promise.resolve(
      stock.emptyFor.has(productId) ? [] : [{ id: productId }]
    );
  },
}));

mock.module("@/modules/services/service.repository", () => ({
  ...actualServiceRepository,
  findServices: (ids: number[]) =>
    Promise.resolve(catalog.services.filter((s) => ids.includes(s.id))),
}));

const { createOrder, getOrderDetailById, listOrders } = await import(
  "@/modules/orders/order.service"
);

// Freeze the till clock at 00:30 in Jakarta on 2 Aug — still 17:30 on 1 Aug
// in UTC. A shop open past midnight must stamp receipts with the new Jakarta
// business date; a UTC-clocked server would keep yesterday's date and hand
// out duplicate tag numbers against yesterday's counter sequence.
const JAKARTA_DATE = "02082026";
setSystemTime(new Date("2026-08-01T17:30:00Z"));

afterAll(() => {
  setSystemTime();
  mock.module("@/modules/orders/order.repository", () => actualOrderRepository);
  mock.module(
    "@/modules/customers/customer.service",
    () => actualCustomerService
  );
  mock.module(
    "@/modules/campaigns/campaign-redemption.service",
    () => actualRedemptionService
  );
  mock.module(
    "@/modules/orders/order-courier.service",
    () => actualCourierService
  );
  mock.module(
    "@/modules/orders/order-discount.service",
    () => actualDiscountService
  );
  mock.module(
    "@/modules/products/product.repository",
    () => actualProductRepository
  );
  mock.module(
    "@/modules/services/service.repository",
    () => actualServiceRepository
  );
});

const CASHIER_ID = 42;
const STORE = { id: 1, code: "JKT" } as unknown as Store;

const checkout = (over: AnyObj = {}) =>
  createOrder(CASHIER_ID, STORE, {
    customer: { name: "Budi", phone_number: "081234567890" },
    store_id: 1,
    campaign_ids: [],
    voucher_codes: [],
    discount: 0,
    payment_status: "unpaid",
    ...over,
  } as never);

beforeEach(() => {
  catalog.products = [];
  catalog.services = [];
  repo.sequence = 1;
  repo.reserveCalls = [];
  repo.insertedOrder = undefined;
  repo.serviceRows = [];
  repo.productRows = [];
  repo.findOrdersCalls = [];
  stock.calls = [];
  stock.emptyFor = new Set();
  customers.calls = [];
  discount.calls = [];
  discount.result = {
    campaignRows: [],
    discountAmount: 0,
    discountSource: "none",
  };
  redemptions.calls = [];
  courier.calls = [];
  authz.assertCalls = [];
  authz.listCalls = [];
  authz.storeIds = [];
  finalize.writes = [];
  detail.row = undefined;
});

describe("createOrder", () => {
  it("books a walk-in drop-off as an open, unpaid order under today's counter number", async () => {
    // Wash Rp30.000 + iron Rp15.000, customer pays at pickup. The clock is
    // frozen just past midnight Jakarta (still 1 Aug in UTC), so the receipt
    // must literally read 02082026 — the Jakarta business date — and no
    // rupiah may land in paid_amount before money actually changes hands.
    catalog.services = [
      {
        id: 10,
        price: "30000",
        cogs: "12000",
        is_priority: false,
        is_active: true,
      },
      {
        id: 11,
        price: "15000",
        cogs: "4000",
        is_priority: false,
        is_active: true,
      },
    ];

    const result = await checkout({ services: [{ id: 10 }, { id: 11 }] });

    expect(result).toEqual({
      code: `#JKT/${JAKARTA_DATE}/1`,
      id: 501,
      total: "45000",
      total_after_discount: "45000",
    });
    expect(repo.reserveCalls).toHaveLength(1);
    expect(repo.reserveCalls[0].tx).toBe(TX);
    expect(repo.reserveCalls[0]).toMatchObject({
      storeCode: "JKT",
      dateStr: JAKARTA_DATE,
    });
    expect(repo.insertedOrder).toMatchObject({
      status: "created",
      completed_at: null,
      customer_id: 77,
      created_by: CASHIER_ID,
    });
    expect(finalize.writes).toHaveLength(1);
    expect(finalize.writes[0].table).toBe(ordersTable);
    expect(finalize.writes[0].set).toEqual({
      total: "45000",
      discount: "0",
      discount_source: "none",
      paid_amount: "0",
      paid_at: null,
      paid_by: null,
    });
  });

  it("births a retail-only sale as completed so detergent never sits in the wash queue", async () => {
    // A customer buying a bottle of detergent walks out with it immediately —
    // there is no garment for the workers to process, so an open order would
    // clog the queue board forever.
    catalog.products = [
      {
        id: 20,
        name: "Detergent 1L",
        price: "25000",
        cogs: "10000",
        is_active: true,
      },
    ];

    await checkout({ products: [{ id: 20, qty: 1 }] });

    expect(repo.insertedOrder?.status).toBe("completed");
    expect(repo.insertedOrder?.completed_at).toBeInstanceOf(Date);
  });

  it("routes the net amount into the paid fields when the customer pays at drop-off", async () => {
    // Rp50.000 order with a Rp5.000 promo, settled at the counter. The till
    // holds Rp45.000 — booking the gross would overstate revenue by the
    // discount, and the promo's redemption must be burned in the same breath.
    catalog.services = [
      {
        id: 10,
        price: "50000",
        cogs: "20000",
        is_priority: false,
        is_active: true,
      },
    ];
    discount.result = {
      campaignRows: [{ campaign_id: 3, kind: "listed" }],
      discountAmount: 5000,
      discountSource: "campaign",
    };

    const result = await checkout({
      services: [{ id: 10 }],
      campaign_ids: [3],
      payment_status: "paid",
      payment_method_id: 1,
    });

    expect(result.total).toBe("50000");
    expect(result.total_after_discount).toBe("45000");

    // The discount desk judges the GROSS order, not the running balance.
    expect(discount.calls[0]).toMatchObject({
      campaignIds: [3],
      voucherCodes: [],
      grossTotal: 50_000,
      manualDiscount: 0,
      storeId: 1,
      storeCode: "JKT",
    });

    const set = finalize.writes[0].set;
    expect(set.total).toBe("50000");
    expect(set.discount).toBe("5000");
    expect(set.paid_amount).toBe("45000");
    expect(set.paid_at).toBeInstanceOf(Date);
    expect(set.paid_by).toBe(CASHIER_ID);

    expect(redemptions.calls).toHaveLength(1);
    expect(redemptions.calls[0].tx).toBe(TX);
    expect(redemptions.calls[0].rows).toBe(discount.result.campaignRows);
    expect(redemptions.calls[0].orderId).toBe(501);
  });

  it("rejects a discount larger than the order without spending the voucher", async () => {
    // Stacked promos worth Rp60.000 against a Rp50.000 basket. A negative
    // total is nonsense at the till — and the customer's slip must survive the
    // failed checkout so they can retry, not lose the code to a dead order.
    catalog.services = [
      {
        id: 10,
        price: "50000",
        cogs: "20000",
        is_priority: false,
        is_active: true,
      },
    ];
    discount.result = {
      campaignRows: [
        { campaign_id: 5, kind: "voucher", voucherCode: "VIP12345" },
      ],
      discountAmount: 60_000,
      discountSource: "campaign",
    };

    const error = await captureRejection(
      checkout({ services: [{ id: 10 }], voucher_codes: ["VIP12345"] })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order discount cannot exceed order total"
    );
    expect(redemptions.calls).toHaveLength(0);
  });

  it("honors a voucher worth exactly the basket as a free wash", async () => {
    // A Rp50.000 comp voucher against a Rp50.000 wash is a legitimate 100%
    // giveaway — the shop hands the wash out free all the time for complaints.
    // The gate must reject only discounts LARGER than the order; turning away
    // the exact-match comp would strand the manager's apology voucher. And the
    // voucher still burns, or the customer washes free twice.
    catalog.services = [
      {
        id: 10,
        price: "50000",
        cogs: "20000",
        is_priority: false,
        is_active: true,
      },
    ];
    discount.result = {
      campaignRows: [
        { campaign_id: 5, kind: "voucher", voucherCode: "SORRY123" },
      ],
      discountAmount: 50_000,
      discountSource: "campaign",
    };

    const result = await checkout({
      services: [{ id: 10 }],
      voucher_codes: ["SORRY123"],
    });

    expect(result.total).toBe("50000");
    expect(result.total_after_discount).toBe("0");
    expect(redemptions.calls).toHaveLength(1);
    expect(redemptions.calls[0].rows).toBe(discount.result.campaignRows);
    expect(finalize.writes[0].set).toMatchObject({
      total: "50000",
      discount: "50000",
    });
  });

  it("turns away a discontinued product before consuming a daily order number", async () => {
    // The counter sequence resets daily and numbers the physical laundry tags;
    // burning one on a sale that can never complete leaves a hole in the day's
    // paper trail.
    catalog.products = [
      {
        id: 20,
        name: "Old Softener",
        price: "10000",
        cogs: "4000",
        is_active: false,
      },
    ];

    const error = await captureRejection(
      checkout({ products: [{ id: 20, qty: 1 }] })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Product is not active: 20");
    expect(repo.reserveCalls).toHaveLength(0);
    expect(repo.insertedOrder).toBeUndefined();
  });

  it("refuses a retired treatment a still-open till keeps offering", async () => {
    // The shop pulled suede restoration off the menu this morning, but the
    // cashier's tablet has been open since before that and still lists it. The
    // POS only hides retired treatments client-side, so nothing but this gate
    // stops its price and COGS being snapshotted onto a live order.
    catalog.services = [
      {
        id: 12,
        price: "40000",
        cogs: "18000",
        is_priority: false,
        is_active: false,
      },
    ];

    const error = await captureRejection(checkout({ services: [{ id: 12 }] }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Service is not active: 12");
    expect(repo.reserveCalls).toHaveLength(0);
    expect(repo.insertedOrder).toBeUndefined();
    expect(repo.serviceRows).toEqual([]);
  });

  it("lets an out-of-stock failure escape the transaction so no half-created order survives", async () => {
    // Two cashiers race for the last bottle. The loser's order row was already
    // written inside the transaction — the thrown error is what rolls it back;
    // swallowing it would leave a ghost order that was never sellable.
    catalog.products = [
      {
        id: 20,
        name: "Detergent 1L",
        price: "25000",
        cogs: "10000",
        is_active: true,
      },
    ];
    stock.emptyFor.add(20);

    const error = await captureRejection(
      checkout({ products: [{ id: 20, qty: 5 }] })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Insufficient stock for product Detergent 1L"
    );
    // The shelf was asked for all five bottles at once — an atomic take-5, not
    // five take-1s a racing cashier could interleave with.
    expect(stock.calls).toEqual([{ productId: 20, qty: 5 }]);
    // The order row went in before the stock check; the finalizing money write
    // never ran — proof the rejection cut the checkout short mid-transaction.
    expect(repo.insertedOrder).toBeDefined();
    expect(finalize.writes).toHaveLength(0);
  });

  it("snapshots catalog prices and COGS onto the lines and tags each garment", async () => {
    // Margins are reported from these snapshots months later, when catalog
    // prices have moved on. 3 detergents at COGS 1250.50 must book 3752 — the
    // books are kept in whole rupiah, so the half is settled here rather than
    // left for the database to drop. Each garment gets a sequential tag off the
    // receipt code; a line without an explicit priority takes the service's
    // default, an explicit choice beats it.
    catalog.services = [
      {
        id: 10,
        price: "30000",
        cogs: "12000",
        is_priority: true,
        is_active: true,
      },
      {
        id: 11,
        price: "15000",
        cogs: "4000",
        is_priority: true,
        is_active: true,
      },
    ];
    catalog.products = [
      {
        id: 20,
        name: "Detergent 1L",
        price: "25000",
        cogs: "1250.50",
        is_active: true,
      },
    ];

    const result = await checkout({
      services: [{ id: 10 }, { id: 11, is_priority: false }],
      products: [{ id: 20, qty: 3 }],
    });

    const code = `#JKT/${JAKARTA_DATE}/1`;
    expect(result.total).toBe("120000");

    // Three bottles sold must leave the shelf count as three — a decrement of
    // one would let the system keep selling detergent that is no longer there.
    expect(stock.calls).toEqual([{ productId: 20, qty: 3 }]);

    expect(repo.productRows).toEqual([
      {
        order_id: 501,
        product_id: 20,
        price: "25000",
        cogs_snapshot: "3752",
        qty: 3,
      },
    ]);

    expect(repo.serviceRows).toHaveLength(2);
    expect(repo.serviceRows[0]).toMatchObject({
      item_code: `${code}-S001`,
      is_priority: true,
      order_id: 501,
      service_id: 10,
      price: "30000",
      cogs_snapshot: "12000",
      status: "queued",
    });
    expect(repo.serviceRows[1]).toMatchObject({
      item_code: `${code}-S002`,
      is_priority: false,
      service_id: 11,
      price: "15000",
    });
  });

  it("verifies the courier only when the bag arrived with one", async () => {
    // Most orders are handed over the counter; only courier-collected bags
    // must name an active courier, so the check must not fire for walk-ins.
    catalog.services = [
      {
        id: 10,
        price: "30000",
        cogs: "12000",
        is_priority: false,
        is_active: true,
      },
    ];

    await checkout({ services: [{ id: 10 }] });
    expect(courier.calls).toEqual([]);
    expect(repo.insertedOrder?.collected_by).toBeNull();

    await checkout({ services: [{ id: 10 }], collected_by: 9 });
    expect(courier.calls).toEqual([9]);
    expect(repo.insertedOrder?.collected_by).toBe(9);
  });
});

describe("listOrders", () => {
  const cashier = { id: CASHIER_ID, role: "cashier" } as unknown as JWTPayload;
  const admin = { id: 1, role: "admin" } as unknown as JWTPayload;

  it("fences a cashier without a store filter into their own stores", async () => {
    // A cashier browsing "all orders" must still only see the branches they
    // work at — an open list would leak every store's revenue to any staff.
    authz.storeIds = [1, 2];

    await listOrders(undefined, cashier);

    expect(authz.listCalls).toEqual([CASHIER_ID]);
    expect(repo.findOrdersCalls[0].scopedStoreIds).toEqual([1, 2]);
    expect(authz.assertCalls).toHaveLength(0);
  });

  it("checks access for an explicit store filter instead of scoping", async () => {
    // Asking for store 3 by name is an access question, not a scoping one:
    // either the cashier works there and sees exactly that store, or the
    // request is refused outright.
    await listOrders(
      { store_id: 3, sort_by: "id" as const, sort_order: "desc" as const },
      cashier
    );

    expect(authz.assertCalls).toEqual([{ userId: CASHIER_ID, storeId: 3 }]);
    expect(authz.listCalls).toHaveLength(0);
    expect(repo.findOrdersCalls[0].scopedStoreIds).toBeUndefined();
  });

  it("lets an admin see everything without any store gate", async () => {
    await listOrders(undefined, admin);

    expect(authz.listCalls).toHaveLength(0);
    expect(authz.assertCalls).toHaveLength(0);
    expect(repo.findOrdersCalls[0].scopedStoreIds).toBeUndefined();
  });
});

describe("getOrderDetailById", () => {
  it("strips the pickup code from the detail response", async () => {
    // The pickup code is the bearer secret that releases the laundry — it
    // lives only on the printed receipt (ADR-0005/0016). Any API surface that
    // echoes it would let staff or a shoulder-surfer release someone else's
    // clothes.
    detail.row = {
      id: 9,
      pickup_code: "AB12",
      paid_amount: "50000",
      refunded_amount: "0",
      dropoff_photo_path: null,
      pickupEvents: [],
      services: [],
    };

    const result = await getOrderDetailById(9);

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("pickup_code");
    expect(result?.id).toBe(9);
  });
});
