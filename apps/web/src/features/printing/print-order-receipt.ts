import { fetchOrderReceipt } from "@/features/orders/api";
import { buildTrackingUrl } from "@/features/orders/lib/tracking-link";
import { buildReceiptEscPos } from "./build-receipt";
import type { PrintOptions } from "./printer-transport";
import { webBluetoothTransport } from "./web-bluetooth-transport";

// Swap point if the CBT-80 turns out Classic-only in the field: implement a
// RawBT PrinterTransport and assign it here — nothing above this changes.
const transport = webBluetoothTransport;

export const printOrderReceipt = async (
	orderId: number,
	options: Pick<PrintOptions, "allowPairing">,
): Promise<void> => {
	const receipt = await fetchOrderReceipt(orderId);
	const trackingUrl = buildTrackingUrl(
		receipt.code,
		receipt.customer.phone_number,
	);
	await transport.print(buildReceiptEscPos(receipt, trackingUrl), {
		...options,
		deviceNames: receipt.store.devices.map((device) => device.name),
	});
};
