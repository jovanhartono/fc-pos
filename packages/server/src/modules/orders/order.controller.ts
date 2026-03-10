import type z from "zod";
import { ForbiddenException, NotFoundException } from "@/errors";
import type { GetOrdersQuery } from "@/modules/orders/order.schema";
import { createOrder, listOrders } from "@/modules/orders/order.service";
import { findStoreById } from "@/modules/stores/store.repository";
import { findUserById } from "@/modules/users/user.repository";
import type { POSTOrderSchema } from "@/schema";

export function getOrdersController(query?: GetOrdersQuery) {
  return listOrders(query);
}

interface CreateOrderControllerInput {
  userId: number;
  body: z.infer<typeof POSTOrderSchema>;
}

export async function createOrderController({
  userId,
  body,
}: CreateOrderControllerInput) {
  const user = await findUserById(userId);

  if (!user) {
    throw new NotFoundException("User not found");
  }

  if (!user.is_active) {
    throw new ForbiddenException("User is not active");
  }

  const store = await findStoreById(body.store_id);

  if (!store) {
    throw new NotFoundException("Store not found");
  }

  return createOrder(user, store, body);
}
