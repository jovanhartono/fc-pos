import { hasStartPhoto } from "@/modules/orders/order-photo-gate.repository";
import {
  findOrderServiceDetail,
  withReworkOpenings,
} from "@/modules/orders/order-read.repository";
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

  const images = rawImages.map(({ image_path, ...image }) => ({
    ...image,
    image_url: buildMediaUrl(image_path),
  }));
  const opened = { ...lineFields, ...withReworkOpenings(line) };

  return {
    order,
    line: {
      ...opened,
      has_start_photo: hasStartPhoto(rawImages, opened),
      item: { ...itemCard, images },
    },
  };
}
