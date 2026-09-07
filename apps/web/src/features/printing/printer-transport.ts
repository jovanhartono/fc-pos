export class PrinterNotPairedError extends Error {
	constructor() {
		super("No printer paired on this device");
		this.name = "PrinterNotPairedError";
	}
}

export class NoRegisteredDeviceError extends Error {
	constructor() {
		super("No Bluetooth device registered for this store");
		this.name = "NoRegisteredDeviceError";
	}
}

export interface PrintOptions {
	// Pairing opens a browser device picker, which requires a user gesture —
	// only the manual print path may allow it.
	allowPairing: boolean;
	// Bluetooth names the store registered from the POS. Only these appear in
	// the picker, so the cashier cannot print to a stray device.
	deviceNames: string[];
}

export interface PrinterTransport {
	print(data: Uint8Array, options: PrintOptions): Promise<void>;
}
