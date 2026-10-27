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
import { BadRequestException } from "@/http-exceptions";
import { authorizationDouble } from "@/test-support/authorization-double";
import { captureRejection } from "@/test-support/capture-rejection";
import type { AuthUser } from "@/types";
import type { Store } from "@/types/entity";

// Checkout at the POS commits the Order code, stock, discounts and Voucher
// codes together or not at all; refusals must come before a code is used up.

type AnyObj = Record<string, unknown>;

interface CatalogService {
  cogs: string;
  id: number;
  is_active: boolean;
  is_priority: boolean;
  // null = no list price (Repair, ADR-0018): priced per Item after inspection.
  price: string | null;
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

const ITEM_ID_BASE = 900;

const repo = {
  sequence: 1,
  reserveCalls: [] as { tx: unknown; storeCode: string; dateStr: string }[],
  orderId: 501,
  insertedOrder: undefined as AnyObj | undefined,
  itemRows: [] as AnyObj[],
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
  storeIds: [] as number[],
};

const finalize = { writes: [] as { table: unknown; set: AnyObj }[] };

const detail = { row: undefined as AnyObj | undefined };

const TX = {
  update: (table: unknown) => ({
    set: (set: AnyObj) => {
      finalize.writes.push({ table, set });
      return { where: () => Promise.resolve() };
    },
  }),
};

// Repositories prepare statements on import, and getOrderDetailById awaits the
// same chain, so both must work.
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

mock.module("@/utils/authorization", () => authorizationDouble(authz));

// Captured before stubbing so afterAll can restore them for other test files.
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
  // Reversed on purpose: OrderServices must be matched to Items by Item code,
  // not by row order.
  insertItems: (_tx: unknown, rows: AnyObj[]) => {
    repo.itemRows = rows;
    return Promise.resolve(
      rows
        .map((row, index) => ({
          id: ITEM_ID_BASE + index,
          item_code: row.item_code as string,
        }))
        .reverse()
    );
  },
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
  resolveDiscount: (_executor: unknown, input: AnyObj) => {
    discount.calls.push(input);
    return Promise.resolve(discount.result);
  },
}));

mock.module("@/modules/products/product.repository", () => ({
  ...actualProductRepository,
  findProducts: (ids: number[]) =>
    Promise.resolve(catalog.products.filter((p) => ids.includes(p.id))),
  decrementProductsStock: (
    _tx: unknown,
    entries: { productId: number; qty: number }[]
  ) => {
    stock.calls.push(...entries);
    return Promise.resolve(
      entries
        .filter((entry) => !stock.emptyFor.has(entry.productId))
        .map((entry) => ({ id: entry.productId }))
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

// 00:30 on 2 Aug in Jakarta, still 1 Aug in UTC: a Store open past midnight
// must use the Jakarta date, or Order codes repeat yesterday's numbers.
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

const checkout = ({ services, ...over }: AnyObj = {}) =>
  createOrder(CASHIER_ID, STORE, {
    customer: { name: "Budi", phone_number: "081234567890" },
    store_id: 1,
    campaign_ids: [],
    voucher_codes: [],
    discount: 0,
    payment_status: "unpaid",
    // `services` gives each OrderService its own Item; tests about grouping
    // pass `items` themselves (ADR-0017).
    ...(services
      ? {
          items: (services as AnyObj[]).map((service) => ({
            services: [service],
          })),
        }
      : {}),
    ...over,
  } as never);

beforeEach(() => {
  catalog.products = [];
  catalog.services = [];
  repo.sequence = 1;
  repo.reserveCalls = [];
  repo.insertedOrder = undefined;
  repo.itemRows = [];
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
  authz.storeIds = [];
  finalize.writes = [];
  detail.row = undefined;
});

describe("createOrder", () => {
  it("books a walk-in drop-off as an open, unpaid order under today's counter number", async () => {
    // Two Services, paid at pickup: the Order code carries the Jakarta date,
    // and nothing lands in paid_amount before money changes hands.
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
    // A Product-only sale leaves with the Customer; left open, it would sit
    // in the Queue forever.
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
    // Paid at drop-off: record the 45.000 actually collected, not the gross,
    // and claim the Campaign in the same transaction.
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

    expect(discount.calls[0]).toMatchObject({
      campaignIds: [3],
      voucherCodes: [],
      grossTotal: 50_000,
      manualDiscount: 0,
      storeId: 1,
      storeCode: "JKT",
    });

    const { set } = finalize.writes[0];
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

  it("honors a voucher worth exactly the basket as a free wash", async () => {
    // A Voucher worth the whole Order is a real free clean; its code is still
    // spent, or the Customer gets it free twice.
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
      payment_status: "paid",
      payment_method_id: 1,
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
    // Order numbers restart daily and go on the tags; using one up on a sale
    // that can't complete leaves a gap in the day's numbers.
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

  it("refuses a retired treatment a still-open POS keeps offering", async () => {
    // A Service turned off this morning still shows on a POS opened before
    // then; only the server stops it reaching an Order.
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
    // Two cashiers race for the last unit; swallowing the error would leave
    // the loser's half-written Order behind.
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
    expect((error as Error).message).toBe("Not enough stock for Detergent 1L");
    // One take of five, not five takes another cashier could slip between.
    expect(stock.calls).toEqual([{ productId: 20, qty: 5 }]);
    expect(repo.insertedOrder).toBeDefined();
    expect(finalize.writes).toHaveLength(0);
  });

  it("snapshots catalog prices and COGS onto the lines and tags each garment", async () => {
    // Margins are reported from these snapshots long after prices change. The
    // books keep whole rupiah, so 3 × 1250.50 rounds to 3752 here.
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

    // Two Items, two Item codes; the code names the Item, not its Services
    // (ADR-0017).
    expect(repo.itemRows).toHaveLength(2);
    expect(repo.itemRows[0]).toMatchObject({
      item_code: `${code}-I001`,
      order_id: 501,
    });
    expect(repo.itemRows[1]).toMatchObject({ item_code: `${code}-I002` });

    expect(repo.serviceRows).toHaveLength(2);
    expect(repo.serviceRows[0]).toMatchObject({
      is_priority: true,
      item_id: ITEM_ID_BASE,
      order_id: 501,
      service_id: 10,
      price: "30000",
      cogs_snapshot: "12000",
      status: "queued",
    });
    expect(repo.serviceRows[1]).toMatchObject({
      is_priority: false,
      item_id: ITEM_ID_BASE + 1,
      service_id: 11,
      price: "15000",
    });
  });

  // The everyday upsell ADR-0017 exists for: one pair in for a deep clean
  // leaves the POS with three Services on it.
  it("gives one pair sold three treatments a single tag", async () => {
    catalog.services = [10, 11, 12].map((id) => ({
      id,
      price: "30000",
      cogs: "12000",
      is_priority: false,
      is_active: true,
    })) as CatalogService[];

    await checkout({
      items: [
        {
          brand: "Nike",
          color: "Black",
          services: [{ id: 10 }, { id: 11 }, { id: 12 }],
        },
      ],
    });

    const code = `#JKT/${JAKARTA_DATE}/1`;

    expect(repo.itemRows).toEqual([
      expect.objectContaining({
        brand: "Nike",
        color: "Black",
        item_code: `${code}-I001`,
        order_id: 501,
      }),
    ]);

    expect(repo.serviceRows).toHaveLength(3);
    expect(repo.serviceRows.map((row) => row.item_id)).toEqual([
      ITEM_ID_BASE,
      ITEM_ID_BASE,
      ITEM_ID_BASE,
    ]);
  });

  it("verifies the courier only when the bag arrived with one", async () => {
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

  // Repair has no list price (ADR-0018): agreed per Item at drop-off when
  // known, otherwise after inspection.
  const REPAIR: CatalogService = {
    id: 30,
    price: null,
    cogs: "0",
    is_priority: false,
    is_active: true,
  };
  const DEEP_CLEAN: CatalogService = {
    id: 10,
    price: "150000",
    cogs: "50000",
    is_priority: false,
    is_active: true,
  };

  it("books a repair whose price was agreed at drop-off as an ordinary payable line", async () => {
    // A toebox patch the cashier prices on the spot can be paid at drop-off
    // like any other Service (ADR-0018).
    catalog.services = [REPAIR];

    const result = await checkout({
      services: [{ id: 30, price: 300_000 }],
      payment_status: "paid",
      payment_method_id: 1,
    });

    expect(result.total).toBe("300000");
    expect(repo.serviceRows[0]).toMatchObject({
      service_id: 30,
      price: "300000",
    });
    expect(finalize.writes[0].set).toMatchObject({ paid_amount: "300000" });
  });

  it("books a repair with no agreed price yet as a blank line, not a zero", async () => {
    // Not priced until inspection, but tagged today (ADR-0018): NULL, never 0,
    // which would read as free on purpose.
    catalog.services = [REPAIR];

    await checkout({ services: [{ id: 30 }] });

    expect(repo.serviceRows[0]).toMatchObject({
      service_id: 30,
      price: null,
    });
    expect(repo.insertedOrder?.payment_status).toBe("unpaid");
  });

  it("refuses paid checkout while a line is unpriced, before any side effect", async () => {
    // ADR-0018: no price, no payment, refused before an Order number or a
    // Voucher code is used up.
    catalog.services = [DEEP_CLEAN, REPAIR];

    const error = await captureRejection(
      checkout({
        services: [{ id: 10 }, { id: 30 }],
        payment_status: "paid",
        payment_method_id: 1,
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order has an unpriced line — set its price before collecting payment"
    );
    expect(repo.reserveCalls).toHaveLength(0);
    expect(redemptions.calls).toHaveLength(0);
  });

  it("rejects a keyed zero on a repair line — free is a Rework, blank is NULL", async () => {
    // 0 means free on purpose (ADR-0013) and "not priced yet" is blank, so a
    // keyed 0 can only be a mistake.
    catalog.services = [REPAIR];

    const error = await captureRejection(
      checkout({ services: [{ id: 30, price: 0 }] })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Price must be greater than zero");
    expect(repo.reserveCalls).toHaveLength(0);
  });

  it("ignores a browser-sent price on a catalog-priced service", async () => {
    // The browser never sets a listed Service's price (ADR-0018).
    catalog.services = [DEEP_CLEAN];

    const result = await checkout({
      services: [{ id: 10, price: 5000 }],
    });

    expect(result.total).toBe("150000");
    expect(repo.serviceRows[0]).toMatchObject({ price: "150000" });
  });

  it("settles a voucher on an unpaid drop-off once every line is priced", async () => {
    // Paid at pickup, but the Receipt is the Customer's only proof of the
    // discount, so it settles and prints now and the code is spent.
    catalog.services = [DEEP_CLEAN];
    discount.result = {
      campaignRows: [{ campaign_id: 5, code_id: 9 }],
      discountAmount: 30_000,
      discountSource: "campaign",
    };

    const result = await checkout({
      services: [{ id: 10 }],
      voucher_codes: ["VIP12345"],
    });

    expect(discount.calls[0]).toMatchObject({
      grossTotal: 150_000,
      voucherCodes: ["VIP12345"],
    });
    expect(redemptions.calls[0].rows).toEqual([{ campaign_id: 5, code_id: 9 }]);
    expect(result.total_after_discount).toBe("120000");
    expect(finalize.writes[0].set).toMatchObject({
      discount: "30000",
      discount_source: "campaign",
      paid_amount: "0",
      paid_at: null,
    });
  });

  it("settles a hand-keyed discount on an unpaid drop-off the same way", async () => {
    // Stored at drop-off, not re-keyed from memory by whoever is at the
    // counter at pickup.
    catalog.services = [DEEP_CLEAN];
    discount.result = {
      campaignRows: [],
      discountAmount: 25_000,
      discountSource: "manual",
    };

    await checkout({ services: [{ id: 10 }], discount: 25_000 });

    expect(discount.calls[0]).toMatchObject({ manualDiscount: 25_000 });
    expect(finalize.writes[0].set).toMatchObject({
      discount: "25000",
      discount_source: "manual",
      paid_amount: "0",
    });
  });

  it("bounces a voucher while any line is still unpriced", async () => {
    // ADR-0018: a Repair guessed at 200k clears a 250k minimum, the code is
    // spent, then inspection says 80k. The code waits for pickup instead.
    catalog.services = [DEEP_CLEAN, REPAIR];

    const error = await captureRejection(
      checkout({
        services: [{ id: 10 }, { id: 30 }],
        voucher_codes: ["VIP12345"],
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order has an unpriced line. Add Campaigns once every line is priced"
    );
    expect(repo.reserveCalls).toHaveLength(0);
    expect(discount.calls).toHaveLength(0);
    expect(redemptions.calls).toHaveLength(0);
  });

  it("stores no discount for a plain unpaid drop-off", async () => {
    catalog.services = [DEEP_CLEAN];

    await checkout({ services: [{ id: 10 }] });

    expect(redemptions.calls[0].rows).toEqual([]);
    expect(finalize.writes[0].set).toMatchObject({
      discount: "0",
      discount_source: "none",
      paid_amount: "0",
    });
  });

  it("feeds the discount desk the full order total, repair spend included", async () => {
    // Repair spend counts toward the minimum (ADR-0018), but a Repair is never
    // the free Item in a buy-one-get-one.
    catalog.services = [DEEP_CLEAN, REPAIR];

    const result = await checkout({
      services: [{ id: 10 }, { id: 30, price: 200_000 }],
      payment_status: "paid",
      payment_method_id: 1,
    });

    expect(result.total).toBe("350000");
    expect(discount.calls[0]).toMatchObject({ grossTotal: 350_000 });
    expect(discount.calls[0].lines).toEqual([
      { price: 150_000, service_id: 10 },
    ]);
  });
});

describe("listOrders", () => {
  const cashier = { id: CASHIER_ID, role: "cashier" } as unknown as AuthUser;
  const admin = { id: 1, role: "admin" } as unknown as AuthUser;

  it("fences a cashier without a store filter into their own stores", async () => {
    // A cashier sees only their own Stores, never every Store's Revenue.
    authz.storeIds = [1, 2];

    await listOrders(undefined, cashier);

    expect(repo.findOrdersCalls[0].scopedStoreIds).toEqual([1, 2]);
    expect(authz.assertCalls).toHaveLength(0);
  });

  it("checks access for an explicit store filter instead of scoping", async () => {
    await listOrders(
      { store_id: 3, sort_by: "id" as const, sort_order: "desc" as const },
      cashier
    );

    expect(authz.assertCalls).toEqual([{ userId: CASHIER_ID, storeId: 3 }]);
    expect(repo.findOrdersCalls[0].scopedStoreIds).toBeUndefined();
  });

  it("lets an admin see everything without any store gate", async () => {
    await listOrders(undefined, admin);

    expect(authz.assertCalls).toHaveLength(0);
    expect(repo.findOrdersCalls[0].scopedStoreIds).toBeUndefined();
  });
});

describe("getOrderDetailById", () => {
  it("strips the pickup code from the detail response", async () => {
    // The Pickup code releases the Items and lives only on the Receipt
    // (ADR-0005/0016); echoing it lets anyone collect someone else's.
    detail.row = {
      id: 9,
      pickup_code: "AB12",
      paid_amount: "50000",
      refunded_amount: "0",
      dropoff_photo_path: null,
      pickupEvents: [],
      pickupNotices: [],
      items: [],
    };

    const result = await getOrderDetailById(9);

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("pickup_code");
    expect(result?.id).toBe(9);
  });
});
