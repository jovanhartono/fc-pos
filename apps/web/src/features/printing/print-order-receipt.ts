import { fetchOrderReceipt } from "@/features/orders/api";
import { buildTrackingUrl } from "@/features/orders/lib/tracking-link";
import { buildReceiptEscPos } from "./build-receipt";
import { trackPrint } from "./pending-prints";
import type { PrintOptions } from "./printer-transport";
import { webBluetoothTransport } from "./web-bluetooth-transport";

// Swap point if the CBT-80 turns out Classic-only in the field: implement a
// RawBT PrinterTransport and assign it here — nothing above this changes.
const transport = webBluetoothTransport;

const sendReceipt = async (
	orderId: number,
	options: Pick<PrintOptions, "allowPairing">,
) => {
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

export const printOrderReceipt = (
	orderId: number,
	options: Pick<PrintOptions, "allowPairing">,
): Promise<void> => {
	const print = sendReceipt(orderId, options);
	trackPrint(print);
	return print;
};
