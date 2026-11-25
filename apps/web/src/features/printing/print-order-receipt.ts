import { fetchOrderReceipt } from "@/features/orders/api";
import { buildTrackingUrl } from "@/features/orders/lib/tracking-link";

import { buildReceiptEscPos } from "./build-receipt";
import type { PrintOptions } from "./printer-transport";
import { webBluetoothTransport } from "./web-bluetooth-transport";

export const printOrderReceipt = async (
  orderId: number,
  options: Pick<PrintOptions, "allowPairing">
): Promise<void> => {
  const receipt = await fetchOrderReceipt(orderId);
  const trackingUrl = buildTrackingUrl(
    receipt.code,
    receipt.customer.phone_number
  );
  await webBluetoothTransport.print(buildReceiptEscPos(receipt, trackingUrl), {
    ...options,
    deviceNames: receipt.store.devices.map((device) => device.name),
  });
};
