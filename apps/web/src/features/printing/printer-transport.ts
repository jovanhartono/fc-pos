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
}

export interface PrinterTransport {
	print(data: Uint8Array, options: PrintOptions): Promise<void>;
}
