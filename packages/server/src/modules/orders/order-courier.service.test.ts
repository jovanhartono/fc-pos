import { describe, expect, it, mock } from "bun:test";
import { BadRequestException } from "@/errors";

interface SeedUser {
  id: number;
  is_active: boolean;
  role: "admin" | "cashier" | "worker" | "courier";
}

const usersById: Record<number, SeedUser> = {
  1: { id: 1, role: "courier", is_active: true },
  2: { id: 2, role: "courier", is_active: false },
  3: { id: 3, role: "worker", is_active: true },
};

// Mock the repository before importing the service so assertActiveCourier
// exercises its branching without touching the database.
mock.module("@/modules/users/user.repository", () => ({
  findUserById: (id: number) => Promise.resolve(usersById[id]),
}));

const { assertActiveCourier } = await import(
  "@/modules/orders/order-courier.service"
);

const captureRejection = async (
  promise: Promise<unknown>
): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject, but it resolved");
};

describe("assertActiveCourier", () => {
  it("resolves for an active courier", async () => {
    expect(await assertActiveCourier(1)).toBeUndefined();
  });

  it("rejects an inactive courier", async () => {
    expect(await captureRejection(assertActiveCourier(2))).toBeInstanceOf(
      BadRequestException
    );
  });

  it("rejects a non-courier role", async () => {
    expect(await captureRejection(assertActiveCourier(3))).toBeInstanceOf(
      BadRequestException
    );
  });

  it("rejects a user id that does not exist", async () => {
    expect(await captureRejection(assertActiveCourier(999))).toBeInstanceOf(
      BadRequestException
    );
  });
});
