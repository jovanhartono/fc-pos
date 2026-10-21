import type { ordersTable } from "@/db/schema";
import { ForbiddenException } from "@/http-exceptions";
import type { JWTPayload } from "@/types";

type OrderForPermissions = Pick<
  typeof ordersTable.$inferSelect,
  "payment_status"
>;

export function assertIsAdmin(user: JWTPayload) {
  if (user.role !== "admin") {
    throw new ForbiddenException("Only admin can perform this action");
  }
}

export function assertCanManageCampaigns(user: JWTPayload) {
  assertIsAdmin(user);
}

export function assertCanManageUsers(user: JWTPayload) {
  assertIsAdmin(user);
}

export function assertCanReassignHandler(user: JWTPayload) {
  assertIsAdmin(user);
}

// A worker rings up a drop-off when no cashier is at the counter (ADR-0004);
// a Courier only clocks in (ADR-0010). A role added later starts without POS.
const POS_ROLES: ReadonlySet<JWTPayload["role"]> = new Set([
  "admin",
  "cashier",
  "worker",
]);

export function assertCanCreateOrder(user: JWTPayload) {
  if (!POS_ROLES.has(user.role)) {
    throw new ForbiddenException("Only shop staff can create orders");
  }
}

export function assertCanViewCounter(user: JWTPayload) {
  if (!POS_ROLES.has(user.role)) {
    throw new ForbiddenException("Only shop staff can view the counter");
  }
}

export function assertCanSendPickupNotice(user: JWTPayload) {
  if (!POS_ROLES.has(user.role)) {
    throw new ForbiddenException("Only shop staff can send pickup notices");
  }
}

export function assertCanProcessPayment(user: JWTPayload) {
  if (!POS_ROLES.has(user.role)) {
    throw new ForbiddenException("Only shop staff can process payment");
  }
}

export function assertCanProcessPickup(user: JWTPayload) {
  const allowed =
    user.role === "admin" ||
    user.role === "cashier" ||
    user.can_process_pickup === true;

  if (!allowed) {
    throw new ForbiddenException(
      "Only admin, cashier, or authorized pickup handlers can complete pickups"
    );
  }
}

// Workshop work (taking a job, moving its status, Item photos) is open to all
// staff and has no check here (ADR-0004).

export function assertCanCancelOrderService(
  user: JWTPayload,
  order: OrderForPermissions
) {
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
}

export function assertCanRefundOrderService(
  user: JWTPayload,
  order: OrderForPermissions
) {
  assertIsAdmin(user);

  if (order.payment_status !== "paid") {
    throw new ForbiddenException(
      "Refund is only allowed on paid orders. Use cancel for unpaid orders."
    );
  }
}
