import { buildTrackingUrl } from "@/features/orders/lib/tracking-link";
import { fetchOrderReceipt, saveStorePrinter } from "@/lib/api";
import { buildReceiptEscPos } from "./build-receipt";
import { webBluetoothTransport } from "./web-bluetooth-transport";

// Swap point if the CBT-80 turns out Classic-only in the field: implement a
// RawBT PrinterTransport and assign it here — nothing above this changes.
const transport = webBluetoothTransport;

export const printOrderReceipt = async (
	orderId: number,
	options: { allowPairing: boolean },
): Promise<void> => {
	const receipt = await fetchOrderReceipt(orderId);
	const trackingUrl = buildTrackingUrl(
		receipt.code,
		receipt.customer.phone_number,
	);
	const { deviceName } = await transport.print(
		buildReceiptEscPos(receipt, trackingUrl),
		{ ...options, printerName: receipt.store.printer_name },
	);

	// First pair at this store: whatever just printed becomes the store's printer.
	// The receipt is already on paper, so a failed save must not read as a
	// failed print.
	if (!receipt.store.printer_name && deviceName) {
		void saveStorePrinter(receipt.store.id, {
			printer_name: deviceName,
		}).catch(() => {
			// the next pairing retries
		});
	}
};
