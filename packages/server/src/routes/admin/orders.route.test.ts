import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { ForbiddenException, NotFoundException } from "@/http-exceptions";
import { authorizationDouble } from "@/test-support/authorization-double";
import type { JWTPayload } from "@/types";
import { errorHandler } from "@/utils/error-handler";

// Every module the orders routes reach on import prepares a statement against
// db.query.<table>, so the stub has to answer any table with a preparable query.
const preparedStub: Record<string, unknown> = {};
preparedStub.prepare = () => preparedStub;
preparedStub.execute = () => Promise.resolve(undefined);

mock.module("@/db", () => ({
  db: {
    query: new Proxy(
      {},
      { get: () => new Proxy({}, { get: () => () => preparedStub }) }
    ),
  },
}));

interface AccessCall {
  orderId: number;
  userId: number;
}

const orderAccessCalls: AccessCall[] = [];

// Asep is rostered at Kemang. Order 777 was taken in at Bintaro, where he does
// not work; order 999 was never written at all.
const KEMANG = 1;
const BINTARO = 2;
const ORDER_STORE: Record<number, number> = {
  123: KEMANG,
  456: KEMANG,
  777: BINTARO,
  1000: KEMANG,
};

mock.module("@/utils/authorization", () => ({
  ...authorizationDouble({ storeIds: [KEMANG] }),
  // The real thing answers "missing" before "not yours", and the routes depend on
  // that order — so the double has to keep it.
  assertOrderAccess: (user: JWTPayload, orderId: number) => {
    orderAccessCalls.push({ userId: user.id, orderId });

    const storeId = ORDER_STORE[orderId];

    if (storeId === undefined) {
      throw new NotFoundException("Order not found");
    }

    if (user.role !== "admin" && storeId !== KEMANG) {
      throw new ForbiddenException("You do not have access to this store");
    }

    return Promise.resolve({ id: orderId, store_id: storeId });
  },
}));

// Each service the guarded routes delegate to is stubbed to a marker, so a
// response body tells us the handler was reached rather than short-circuited.
const reached: string[] = [];
const marker = (name: string) => () => {
  reached.push(name);
  return Promise.resolve({ ok: name });
};

mock.module("@/modules/orders/order.service", () => ({
  createOrder: marker("createOrder"),
  getOrderDetailById: marker("getOrderDetailById"),
  listOrders: () => {
    reached.push("listOrders");
    return Promise.resolve({ items: [], meta: {} });
  },
}));

mock.module("@/modules/orders/order-receipt.service", () => ({
  getOrderReceiptById: marker("getOrderReceiptById"),
}));

mock.module("@/modules/orders/order-queue.service", () => ({
  getMyOrderServices: marker("getMyOrderServices"),
  getOrderServiceById: () => {
    reached.push("getOrderServiceById");
    return Promise.resolve({ order: { store_id: KEMANG } });
  },
  getOrderServiceByItemCode: () => {
    reached.push("getOrderServiceByItemCode");
    return Promise.resolve({ order: { store_id: KEMANG } });
  },
  getOrderServiceQueue: () => {
    reached.push("getOrderServiceQueue");
    return Promise.resolve({ items: [], meta: {} });
  },
  startOrderServiceWork: marker("startOrderServiceWork"),
  updateOrderServiceHandler: marker("updateOrderServiceHandler"),
  updateOrderServiceStatus: marker("updateOrderServiceStatus"),
}));

const ordersRoutes = (await import("@/routes/admin/orders")).default;

// Asep works the Kemang counter. In production adminMiddleware puts him on the
// context; here that one step stands in for the whole JWT layer.
const asep: JWTPayload = {
  id: 7,
  name: "Asep",
  username: "asep",
  role: "cashier",
  can_process_pickup: false,
};

const app = new Hono<{ Variables: { jwtPayload: JWTPayload } }>()
  .use("*", async (c, next) => {
    c.set("jwtPayload", asep);
    await next();
  })
  .route("/orders", ordersRoutes);

app.onError(errorHandler);

const call = (path: string, method = "GET") =>
  app.request(`/orders${path}`, { method });

beforeEach(() => {
  orderAccessCalls.length = 0;
  reached.length = 0;
});

describe("the workshop queue is not an order", () => {
  // These four sit at /orders/services/... — the same shape as an order id. The
  // rack screen is the one the workshop watches all day; treating "services" as
  // an order number takes it down.
  it("opens the rack for the workshop without asking which order 'services' is", async () => {
    const res = await call("/services/queue");

    expect(res.status).toBe(200);
    expect(reached).toContain("getOrderServiceQueue");
    expect(orderAccessCalls).toEqual([]);
  });

  it("shows a worker their own jobs without asking which order 'services' is", async () => {
    const res = await call("/services/me");

    expect(res.status).toBe(200);
    expect(reached).toContain("getMyOrderServices");
    expect(orderAccessCalls).toEqual([]);
  });

  it("looks a garment up by its service id without asking which order 'services' is", async () => {
    const res = await call("/services/by-id?service_id=5");

    expect(res.status).toBe(200);
    expect(reached).toContain("getOrderServiceById");
    expect(orderAccessCalls).toEqual([]);
  });

  it("looks a garment up by the tag pinned to it without asking which order 'services' is", async () => {
    const res = await call("/services/by-item-code?item_code=ORD-0007-1");

    expect(res.status).toBe(200);
    expect(reached).toContain("getOrderServiceByItemCode");
    expect(orderAccessCalls).toEqual([]);
  });
});

describe("opening one order is checked against the branch", () => {
  it("checks the branch before handing over a ticket", async () => {
    const res = await call("/123");

    expect(res.status).toBe(200);
    expect(orderAccessCalls).toEqual([{ userId: 7, orderId: 123 }]);
  });

  it("checks the branch before printing a receipt", async () => {
    const res = await call("/123/receipt");

    expect(res.status).toBe(200);
    expect(orderAccessCalls).toEqual([{ userId: 7, orderId: 123 }]);
  });

  it("checks the branch before touching a single garment on the ticket", async () => {
    const res = await call("/123/services/45/start", "POST");

    expect(res.status).toBe(200);
    expect(orderAccessCalls).toEqual([{ userId: 7, orderId: 123 }]);
  });

  it("charges the counter one branch check per ticket, not two", async () => {
    // A second registration matching the bare /orders/:id would re-run the gate
    // and double the lookup on the most-opened screen in the shop.
    await call("/123");

    expect(orderAccessCalls).toHaveLength(1);
  });
});

describe("a ticket dressed up to look like another branch's", () => {
  // The counter reads the id after coercion, so /orders/+123 and /orders/%20123
  // both open order 123. A gate that only recognises plain digits would wave
  // these through and hand a Bintaro ticket to a Kemang cashier.
  const disguises = ["/+123", "/%20123", "/123%20", "/%09123", "/1e3", "/0123"];

  for (const disguise of disguises) {
    it(`still checks the branch for ${disguise}`, async () => {
      const res = await call(disguise);

      expect(res.status).toBe(200);
      expect(orderAccessCalls).toHaveLength(1);
    });
  }

  it("reads the disguised id as the very order the counter would serve", async () => {
    await call("/1e3");

    expect(orderAccessCalls).toEqual([{ userId: 7, orderId: 1000 }]);
  });
});

describe("what the gate leaves alone", () => {
  it("does not ask which order a list of orders belongs to", async () => {
    const res = await call("");

    expect(res.status).toBe(200);
    expect(reached).toContain("listOrders");
    expect(orderAccessCalls).toEqual([]);
  });

  it("does not ask which order a brand-new order belongs to", async () => {
    // The order does not exist yet; its branch is checked from the body instead.
    const res = await app.request("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).not.toBe(404);
    expect(orderAccessCalls).toEqual([]);
  });

  it("turns away a typo without going to look for an order", async () => {
    const res = await call("/abc");

    expect(res.status).toBe(400);
    expect(orderAccessCalls).toEqual([]);
  });

  it("turns away order zero without going to look for it", async () => {
    const res = await call("/0");

    expect(res.status).toBe(400);
    expect(orderAccessCalls).toEqual([]);
  });
});

describe("an order the cashier may not have", () => {
  it("says the ticket does not exist before it says whose branch it is", async () => {
    // 404 before 403: an order nobody wrote is missing, not forbidden.
    const res = await call("/999");

    expect(res.status).toBe(404);
    expect(orderAccessCalls).toEqual([{ userId: 7, orderId: 999 }]);
  });

  it("refuses a ticket that belongs to another branch", async () => {
    const res = await call("/777");

    expect(res.status).toBe(403);
    expect(orderAccessCalls).toEqual([{ userId: 7, orderId: 777 }]);
  });
});
