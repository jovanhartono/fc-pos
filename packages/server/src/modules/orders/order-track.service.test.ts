import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NotFoundException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";

// Nothing here touches a database: the reveal rule and the mask are the whole
// subject, so the two reads the service makes are handed back as fixtures.
mock.module("@/db", () => ({ db: {} }));

const state = {
  customer: undefined as { id: number } | undefined,
  order: undefined as Record<string, unknown> | undefined,
};

mock.module("@/modules/customers/customer.repository", () => ({
  findCustomerIdByPhone: () => Promise.resolve(state.customer),
}));

mock.module("@/modules/orders/order-read.repository", () => ({
  findTrackedOrder: () => Promise.resolve(state.order),
}));

const { getTrackedOrder } = await import(
  "@/modules/orders/order-track.service"
);

const CUSTOMER = {
  id: 4,
  name: "Budi Santoso",
  phone_number: "+628111222333",
};

const trackedOrder = (lineStatus: "queued" | "ready_for_pickup") => ({
  id: 9,
  code: "#KMG/260912/1",
  pickup_code: "428913",
  customer: CUSTOMER,
  items: [
    {
      id: 1,
      item_code: "KMG-0001",
      services: [
        {
          id: 11,
          pickup_event_id: null,
          status: lineStatus,
          service: { id: 2, code: "DCLN", name: "Deep Clean" },
          statusLogs: [],
        },
      ],
    },
  ],
});

const track = () =>
  getTrackedOrder({
    code: "#KMG/260912/1",
    phone_number: CUSTOMER.phone_number,
  });

beforeEach(() => {
  state.customer = { id: CUSTOMER.id };
  state.order = trackedOrder("queued");
});

describe("pickup code", () => {
  it("stays hidden while the objects are still in the shop", async () => {
    const result = await track();

    expect(result.pickup_code).toBeNull();
  });

  it("is shown once an object is ready to collect", async () => {
    state.order = trackedOrder("ready_for_pickup");

    const result = await track();

    expect(result.pickup_code).toBe("428913");
  });
});

describe("phone number", () => {
  it("comes back masked to the last four digits", async () => {
    const result = await track();

    expect(result.customer).toEqual({
      id: CUSTOMER.id,
      name: CUSTOMER.name,
      phone_number_masked: "******2333",
    });
  });
});

describe("lookup", () => {
  // The code and the phone are the only credential pair, so a wrong phone and
  // a code belonging to someone else answer the same way — otherwise the page
  // confirms which of the two the guesser got right.
  it("answers the same way for an unknown phone number and a foreign code", async () => {
    state.customer = undefined;
    const unknownPhone = await captureRejection(track());

    state.customer = { id: CUSTOMER.id };
    state.order = undefined;
    const foreignCode = await captureRejection(track());

    expect(unknownPhone).toBeInstanceOf(NotFoundException);
    expect(foreignCode).toBeInstanceOf(NotFoundException);
    expect((unknownPhone as Error).message).toBe(
      "Order code or phone number is invalid"
    );
    expect((foreignCode as Error).message).toBe(
      (unknownPhone as Error).message
    );
  });
});
