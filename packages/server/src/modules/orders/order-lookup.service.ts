import { NotFoundException } from "@/http-exceptions";
import {
  getItemByItemCode,
  getOrderServiceById,
} from "@/modules/orders/order-queue.service";
import { findOrderForLookup } from "@/modules/orders/order-read.repository";
import { isNumericSearch } from "@/modules/orders/order-search";
import type { JWTPayload } from "@/types";
import { assertStoreAccess } from "@/utils/authorization";

interface OrderLookupResult {
  item_code: string | null;
  order_id: number;
  service_id: number | null;
  store_id: number;
}

export async function resolveOrderLookup(
  user: JWTPayload,
  q: string
): Promise<OrderLookupResult> {
  const query = q.trim();

  if (isNumericSearch(query)) {
    const numericId = Number(query);

    const order = await findOrderForLookup(numericId);
    if (order) {
      await assertStoreAccess(user, order.store_id);
      return {
        order_id: order.id,
        store_id: order.store_id,
        service_id: null,
        item_code: null,
      };
    }

    const orderService = await getOrderServiceById(numericId);
    if (orderService?.order) {
      await assertStoreAccess(user, orderService.order.store_id);
      return {
        order_id: orderService.order.id,
        store_id: orderService.order.store_id,
        service_id: orderService.id,
        item_code: null,
      };
    }
  }

  const item = await getItemByItemCode(query);
  if (!item?.order) {
    throw new NotFoundException("Nothing matched that search");
  }

  await assertStoreAccess(user, item.order.store_id);

  // The single-live-treatment rule: an Item with exactly one open line sends
  // the worker straight to it. Zero open lines shows its Order — the
  // customer is here to collect, not to start work. More than one names the
  // Item code instead, so the web filters the queue to it and lets the
  // worker pick.
  const liveServiceId = item.services.length === 1 ? item.services[0].id : null;

  return {
    order_id: item.order.id,
    store_id: item.order.store_id,
    service_id: liveServiceId,
    item_code: item.services.length > 1 ? item.item_code : null,
  };
}
