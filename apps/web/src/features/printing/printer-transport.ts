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
	// The store's remembered printer: the cashier sees that one device instead
	// of guessing among every phone and speaker in the mall.
	printerName: string | null;
}

export interface PrintResult {
	deviceName: string | null;
}

export interface PrinterTransport {
	print(data: Uint8Array, options: PrintOptions): Promise<PrintResult>;
}
