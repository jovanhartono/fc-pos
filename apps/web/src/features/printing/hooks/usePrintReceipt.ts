import { useMutation } from "@tanstack/react-query";
import { printOrderReceipt } from "@/features/printing/print-order-receipt";

// Manual print/reprint. Runs inside a user gesture, so first use doubles as
// the Bluetooth pairing flow. Global mutation callbacks handle both toasts.
export const usePrintReceiptMutation = (orderId: number) =>
	useMutation({
		mutationFn: async () => {
			await printOrderReceipt(orderId, { allowPairing: true });
			return { message: "Receipt sent to printer" };
		},
	});
