import { describe, expect, it } from "bun:test";
import { ForbiddenException } from "@/errors";
import {
  assertCanCancelOrderService,
  assertCanCreateOrder,
  assertCanManageCampaigns,
  assertCanManageUsers,
  assertCanProcessPayment,
  assertCanProcessPickup,
  assertCanReassignHandler,
  assertCanRefundOrderService,
  assertIsAdmin,
} from "@/modules/permissions/permissions";
import type { JWTPayload } from "@/types";

type Role = JWTPayload["role"];

const buildUser = (
  role: Role,
  overrides: Partial<JWTPayload> = {}
): JWTPayload => ({
  id: 1,
  name: "Test",
  username: "test",
  role,
  can_process_pickup: false,
  ...overrides,
});

const admin = buildUser("admin");
const cashier = buildUser("cashier");
const worker = buildUser("worker");
const courier = buildUser("courier");
const cashierWithPickup = buildUser("cashier", { can_process_pickup: true });
const workerWithPickup = buildUser("worker", { can_process_pickup: true });

describe("assertIsAdmin", () => {
  it("allows admin", () => {
    expect(() => assertIsAdmin(admin)).not.toThrow();
  });

  it("rejects cashier and worker", () => {
    expect(() => assertIsAdmin(cashier)).toThrow(ForbiddenException);
    expect(() => assertIsAdmin(worker)).toThrow(ForbiddenException);
  });
});

describe("assertCanManageCampaigns / Users / ReassignHandler", () => {
  it("admin-only — all three delegate to assertIsAdmin", () => {
    expect(() => assertCanManageCampaigns(admin)).not.toThrow();
    expect(() => assertCanManageUsers(admin)).not.toThrow();
    expect(() => assertCanReassignHandler(admin)).not.toThrow();
    expect(() => assertCanManageCampaigns(cashier)).toThrow(ForbiddenException);
    expect(() => assertCanManageUsers(worker)).toThrow(ForbiddenException);
    expect(() => assertCanReassignHandler(cashier)).toThrow(ForbiddenException);
  });
});

describe("assertCanCreateOrder", () => {
  it("allows admin and cashier", () => {
    expect(() => assertCanCreateOrder(admin)).not.toThrow();
    expect(() => assertCanCreateOrder(cashier)).not.toThrow();
  });

  it("rejects worker", () => {
    expect(() => assertCanCreateOrder(worker)).toThrow(ForbiddenException);
  });
});

describe("assertCanProcessPayment", () => {
  it("allows admin and cashier", () => {
    expect(() => assertCanProcessPayment(admin)).not.toThrow();
    expect(() => assertCanProcessPayment(cashier)).not.toThrow();
  });

  it("rejects worker", () => {
    expect(() => assertCanProcessPayment(worker)).toThrow(ForbiddenException);
  });
});

describe("assertCanProcessPickup", () => {
  it("allows admin and cashier unconditionally", () => {
    expect(() => assertCanProcessPickup(admin)).not.toThrow();
    expect(() => assertCanProcessPickup(cashier)).not.toThrow();
  });

  it("allows worker only when can_process_pickup=true", () => {
    expect(() => assertCanProcessPickup(worker)).toThrow(ForbiddenException);
    expect(() => assertCanProcessPickup(workerWithPickup)).not.toThrow();
  });

  it("respects can_process_pickup=true even for cashier (no effect — already allowed)", () => {
    expect(() => assertCanProcessPickup(cashierWithPickup)).not.toThrow();
  });
});

describe("assertCanCancelOrderService", () => {
  const unpaid = { payment_status: "unpaid" as const };
  const paid = { payment_status: "paid" as const };

  it("allows admin, cashier, worker on unpaid order", () => {
    expect(() => assertCanCancelOrderService(admin, unpaid)).not.toThrow();
    expect(() => assertCanCancelOrderService(cashier, unpaid)).not.toThrow();
    expect(() => assertCanCancelOrderService(worker, unpaid)).not.toThrow();
  });

  it("rejects all roles when order is paid", () => {
    expect(() => assertCanCancelOrderService(admin, paid)).toThrow(
      ForbiddenException
    );
    expect(() => assertCanCancelOrderService(cashier, paid)).toThrow(
      ForbiddenException
    );
    expect(() => assertCanCancelOrderService(worker, paid)).toThrow(
      ForbiddenException
    );
  });
});

describe("assertCanRefundOrderService", () => {
  const unpaid = { payment_status: "unpaid" as const };
  const paid = { payment_status: "paid" as const };

  it("allows admin only on paid order", () => {
    expect(() => assertCanRefundOrderService(admin, paid)).not.toThrow();
  });

  it("rejects non-admin even on paid order", () => {
    expect(() => assertCanRefundOrderService(cashier, paid)).toThrow(
      ForbiddenException
    );
    expect(() => assertCanRefundOrderService(worker, paid)).toThrow(
      ForbiddenException
    );
  });

  it("rejects admin on unpaid order", () => {
    expect(() => assertCanRefundOrderService(admin, unpaid)).toThrow(
      ForbiddenException
    );
  });
});

describe("courier role gains no privileged powers (ADR-0010)", () => {
  const unpaid = { payment_status: "unpaid" as const };

  it("is excluded from every restricted seam", () => {
    expect(() => assertIsAdmin(courier)).toThrow(ForbiddenException);
    expect(() => assertCanCreateOrder(courier)).toThrow(ForbiddenException);
    expect(() => assertCanProcessPayment(courier)).toThrow(ForbiddenException);
    expect(() => assertCanProcessPickup(courier)).toThrow(ForbiddenException);
    expect(() => assertCanCancelOrderService(courier, unpaid)).toThrow(
      ForbiddenException
    );
  });
});
