import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NotFoundException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";

mock.module("@/db", () => ({ db: {} }));

let order: Record<string, unknown> | undefined;

mock.module("@/modules/orders/order-read.repository", () => ({
  findTrackedOrder: () => Promise.resolve(order),
  findTrackedOrderRef: () => Promise.resolve(order),
}));

mock.module("@/modules/payments/payment-charge.service", () => ({
  createPaymentCharge: () =>
    Promise.resolve({ qr_image_url: null, redirect_url: null }),
  getTrackPaymentState: () =>
    Promise.resolve({ can_pay_online: false, net_due: 0, open_charge: null }),
  toTrackChargeView: (charge: unknown) => charge,
}));

const { getTrackedOrder, payTrackedOrder } = await import(
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
  order = trackedOrder("queued");
});

describe("pickup code", () => {
  it("stays hidden while the objects are still in the shop", async () => {
    const result = await track();

    expect(result.pickup_code).toBeNull();
  });

  it("is shown once an object is ready to collect", async () => {
    order = trackedOrder("ready_for_pickup");

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
  it("answers not found when no Order matches the code and phone", async () => {
    order = undefined;
    const missing = await captureRejection(track());

    expect(missing).toBeInstanceOf(NotFoundException);
    expect((missing as Error).message).toBe(
      "Order code or phone number is invalid"
    );
  });

  it("asks the same proof before opening a payment page", async () => {
    order = undefined;

    const error = await captureRejection(
      payTrackedOrder({
        code: "#KMG/260912/1",
        phone_number: CUSTOMER.phone_number,
      })
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(
      "Order code or phone number is invalid"
    );
  });
});
