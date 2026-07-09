import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PrinterStore {
	deviceId: string | null;
	setDeviceId: (deviceId: string | null) => void;
}

// Paired receipt-printer identity for this device. Only the id persists —
// the live BluetoothDevice handle is cached in the transport module.
export const usePrinterStore = create<PrinterStore>()(
	persist(
		(set) => ({
			deviceId: null,
			setDeviceId: (deviceId) => set({ deviceId }),
		}),
		{
			name: "printer",
		},
	),
);
