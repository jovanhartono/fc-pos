export class PrinterNotPairedError extends Error {
	constructor() {
		super("No printer paired on this device");
		this.name = "PrinterNotPairedError";
	}
}

export interface PrintOptions {
	// Pairing opens a browser device picker, which requires a user gesture —
	// only the manual print path may allow it.
	allowPairing: boolean;
	// Advertised Bluetooth name of the store's receipt printer, once the store
	// has paired one. The picker then lists that printer alone instead of every
	// phone and speaker in the mall. Null: any device may be picked, and the one
	// that prints becomes the store's printer.
	printerName: string | null;
}

export interface PrintResult {
	// Advertised name of the device that took the print, so the caller can
	// remember it for the store. Null when the device advertises no name.
	deviceName: string | null;
}

export interface PrinterTransport {
	print(data: Uint8Array, options: PrintOptions): Promise<PrintResult>;
}
