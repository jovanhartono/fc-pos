import { describe, expect, it, mock } from "bun:test";
import { ForbiddenException, NotFoundException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

const KEMANG = 1;
const BINTARO = 2;

mock.module("@/utils/authorization", () => ({
  assertStoreAccess: (user: JWTPayload, storeId: number) => {
    if (user.role !== "admin" && storeId !== KEMANG) {
      throw new ForbiddenException("You do not have access to this store");
    }
    return Promise.resolve();
  },
}));

mock.module("@/modules/orders/order-read.repository", () => ({
  findOrderForLookup: (id: number) => {
    if (id === 500) {
      return Promise.resolve({ id: 500, store_id: KEMANG });
    }
    return Promise.resolve(undefined);
  },
}));

mock.module("@/modules/orders/order-queue.service", () => ({
  getOrderServiceById: (id: number) => {
    if (id === 45) {
      return Promise.resolve({ id: 45, order: { id: 123, store_id: KEMANG } });
    }
    return Promise.resolve(undefined);
  },
  getItemByItemCode: (itemCode: string) => {
    const items: Record<
      string,
      { order: { id: number; store_id: number }; services: { id: number }[] }
    > = {
      "ZERO-LIVE": {
        order: { id: 200, store_id: KEMANG },
        services: [],
      },
      "ONE-LIVE": {
        order: { id: 201, store_id: KEMANG },
        services: [{ id: 9001 }],
      },
      "TWO-LIVE": {
        order: { id: 202, store_id: KEMANG },
        services: [{ id: 9002 }, { id: 9003 }],
      },
      "OTHER-STORE": {
        order: { id: 203, store_id: BINTARO },
        services: [{ id: 9004 }],
      },
    };
    const item = items[itemCode];
    return Promise.resolve(item ? { ...item, item_code: itemCode } : undefined);
  },
}));

const { resolveOrderLookup } = await import(
  "@/modules/orders/order-lookup.service"
);

const asep: JWTPayload = {
  id: 7,
  name: "Asep",
  username: "asep",
  role: "cashier",
  can_process_pickup: false,
};

describe("resolveOrderLookup", () => {
  it("resolves a numeric query to the Order it names", async () => {
    expect(await resolveOrderLookup(asep, "500")).toEqual({
      order_id: 500,
      store_id: KEMANG,
      service_id: null,
      item_code: null,
    });
  });

  it("falls through to the OrderService when the number is not an Order id", async () => {
    expect(await resolveOrderLookup(asep, "45")).toEqual({
      order_id: 123,
      store_id: KEMANG,
      service_id: 45,
      item_code: null,
    });
  });

  it("shows the Order for an Item with no open line", async () => {
    expect(await resolveOrderLookup(asep, "ZERO-LIVE")).toEqual({
      order_id: 200,
      store_id: KEMANG,
      service_id: null,
      item_code: null,
    });
  });

  it("sends the worker straight to an Item's one open line", async () => {
    expect(await resolveOrderLookup(asep, "ONE-LIVE")).toEqual({
      order_id: 201,
      store_id: KEMANG,
      service_id: 9001,
      item_code: null,
    });
  });

  it("names the Item code for the web to filter the queue by, when more than one line is open", async () => {
    expect(await resolveOrderLookup(asep, "TWO-LIVE")).toEqual({
      order_id: 202,
      store_id: KEMANG,
      service_id: null,
      item_code: "TWO-LIVE",
    });
  });

  it("404s when nothing matches", async () => {
    expect(
      await captureRejection(resolveOrderLookup(asep, "NOPE"))
    ).toBeInstanceOf(NotFoundException);
  });

  it("403s a cashier of another Store, after the match is resolved", async () => {
    expect(
      await captureRejection(resolveOrderLookup(asep, "OTHER-STORE"))
    ).toBeInstanceOf(ForbiddenException);
  });
});
