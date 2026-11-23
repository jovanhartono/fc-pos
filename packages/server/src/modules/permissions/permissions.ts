import type { ordersTable } from "@/db/schema";
import { ForbiddenException } from "@/http-exceptions";
import type { JWTPayload } from "@/types";

type OrderForPermissions = Pick<
  typeof ordersTable.$inferSelect,
  "payment_status"
>;

export const assertIsAdmin = (user: JWTPayload) => {
  if (user.role !== "admin") {
    throw new ForbiddenException("Only admin can perform this action");
  }
};

export const assertCanManageCampaigns = (user: JWTPayload) => {
  assertIsAdmin(user);
};

export const assertCanManageUsers = (user: JWTPayload) => {
  assertIsAdmin(user);
};

export const assertCanReassignHandler = (user: JWTPayload) => {
  assertIsAdmin(user);
};

// A worker rings up a drop-off when no cashier is at the counter (ADR-0004);
// a Courier only clocks in (ADR-0010). A role added later starts without POS.
const POS_ROLES: ReadonlySet<JWTPayload["role"]> = new Set([
  "admin",
  "cashier",
  "worker",
]);

export const assertCanCreateOrder = (user: JWTPayload) => {
  if (!POS_ROLES.has(user.role)) {
    throw new ForbiddenException("Only shop staff can create orders");
  }
};

export const assertCanViewCounter = (user: JWTPayload) => {
  if (!POS_ROLES.has(user.role)) {
    throw new ForbiddenException("Only shop staff can view the counter");
  }
};

export const assertCanSendPickupNotice = (user: JWTPayload) => {
  if (!POS_ROLES.has(user.role)) {
    throw new ForbiddenException("Only shop staff can send pickup notices");
  }
};

export const assertCanProcessPayment = (user: JWTPayload) => {
  if (!POS_ROLES.has(user.role)) {
    throw new ForbiddenException("Only shop staff can process payment");
  }
};

export const assertCanProcessPickup = (user: JWTPayload) => {
  const allowed =
    user.role === "admin" ||
    user.role === "cashier" ||
    user.can_process_pickup === true;

  if (!allowed) {
    throw new ForbiddenException(
      "Only admin, cashier, or authorized pickup handlers can complete pickups"
    );
  }
};

// Workshop work (taking a job, moving its status, Item photos) is open to all
// staff and has no check here (ADR-0004).

export const assertCanCancelOrderService = (
  user: JWTPayload,
  order: OrderForPermissions
) => {
  if (!["admin", "cashier", "worker"].includes(user.role)) {
    throw new ForbiddenException(
      "Only admin, cashier, or worker can cancel order services"
    );
  }

  if (order.payment_status !== "unpaid") {
    throw new ForbiddenException(
      "Cancel is only allowed on unpaid orders. Use refund for paid orders."
    );
  }
};

export const assertCanRefundOrderService = (
  user: JWTPayload,
  order: OrderForPermissions
) => {
  assertIsAdmin(user);

  if (order.payment_status !== "paid") {
    throw new ForbiddenException(
      "Refund is only allowed on paid orders. Use cancel for unpaid orders."
    );
  }
};
