import { hasStartPhoto } from "@/modules/orders/order-photo-gate.repository";
import {
  findOrderServiceDetail,
  toLastPickupNotice,
  withReworkOpenings,
} from "@/modules/orders/order-read.repository";
import { countItemsReady } from "@/modules/orders/order-status-machine";
import { buildMediaUrl } from "@/utils/s3";

export async function getOrderServiceDetail(
  orderId: number,
  serviceId: number
) {
  const line = await findOrderServiceDetail(orderId, serviceId);

  if (!line) {
    return null;
  }

  const { order, item, ...lineFields } = line;
  const { images: rawImages, ...itemCard } = item;
  const { services: orderLines, pickupNotices, ...orderFields } = order;

  const linesByItem = Map.groupBy(orderLines, (orderLine) => orderLine.item_id);

  const images = rawImages.map(({ image_path, ...image }) => ({
    ...image,
    image_url: buildMediaUrl(image_path),
  }));
  const opened = { ...lineFields, ...withReworkOpenings(line) };

  return {
    order: {
      ...orderFields,
      ...countItemsReady([...linesByItem.values()]),
      last_pickup_notice: toLastPickupNotice(pickupNotices),
    },
    line: {
      ...opened,
      has_start_photo: hasStartPhoto(rawImages, opened),
      item: { ...itemCard, images },
    },
  };
}
