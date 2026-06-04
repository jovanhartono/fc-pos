import type { ordersTable } from "@/db/schema";
import { ForbiddenException } from "@/errors";
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

export function assertCanCreateOrder(user: JWTPayload) {
  if (user.role !== "admin" && user.role !== "cashier") {
    throw new ForbiddenException("Only admin or cashier can create orders");
  }
}

export function assertCanProcessPayment(user: JWTPayload) {
  if (user.role !== "admin" && user.role !== "cashier") {
    throw new ForbiddenException("Only admin or cashier can process payment");
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

// Processing-axis capabilities (self-assign, status updates during processing,
// service detail photos) are open to all staff and have no assert — see
// ADR-0004 amendment 2026-06-04. This module lists restricted capabilities only.

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
