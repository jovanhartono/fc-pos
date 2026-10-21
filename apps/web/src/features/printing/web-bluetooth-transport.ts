import { usePrinterStore } from "@/stores/printer-store";
import {
	NoRegisteredDeviceError,
	PrinterNotPairedError,
	type PrinterTransport,
	type PrintOptions,
} from "./printer-transport";

// Vendor services seen on budget ESC/POS BLE boards (incl. CBT-80-class
// printers). Pairing accepts any device; these only unlock GATT access.
const PRINTER_SERVICES: BluetoothServiceUUID[] = [
	0x18f0,
	0xffe0,
	0xff00,
	0xffb0,
	"e7810a71-73ae-499d-8c15-faa9aef0c3f2",
	"49535343-fe7d-4ae5-8fa9-9fafd205e455",
];

// GATT payload ceiling on Android Chrome is ~512B, but budget printer
// buffers overrun without small chunks and a breather between writes.
const CHUNK_SIZE = 120;
const CHUNK_DELAY_MS = 30;

interface ConnectedPrinter {
	device: BluetoothDevice;
	characteristic: BluetoothRemoteGATTCharacteristic;
}

let cached: ConnectedPrinter | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function findWritableCharacteristic(
	server: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTCharacteristic | null> {
	for (const service of await server.getPrimaryServices()) {
		for (const characteristic of await service.getCharacteristics()) {
			if (
				characteristic.properties.write ||
				characteristic.properties.writeWithoutResponse
			) {
				return characteristic;
			}
		}
	}
	return null;
}

// Chrome never fails a connect to a printer that is off or out of range; it waits
// until the printer shows up again (crbug.com/666377). Uncapped, one dead
// connect would hold up every later print for the rest of the session.
const CONNECT_TIMEOUT_MS = 10_000;

async function connect(device: BluetoothDevice): Promise<ConnectedPrinter> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			device.gatt?.disconnect();
			reject(
				new Error("Printer is not responding — check it is on and in range"),
			);
		}, CONNECT_TIMEOUT_MS);
	});
	let server: BluetoothRemoteGATTServer | undefined;
	try {
		server = await Promise.race([device.gatt?.connect(), timeout]);
	} finally {
		clearTimeout(timer);
	}
	if (!server) {
		throw new Error("Printer refused the Bluetooth connection");
	}

	const characteristic = await findWritableCharacteristic(server);
	if (!characteristic) {
		throw new Error("Printer has no writable Bluetooth channel");
	}

	cached = { device, characteristic };
	device.addEventListener(
		"gattserverdisconnected",
		() => {
			// An admin pairs another Store's printer while the old one is still
			// connected; the old one dropping off later must not forget the new one.
			if (cached?.device === device) {
				cached = null;
			}
		},
		{ once: true },
	);

	return cached;
}

async function findGrantedDevice(
	deviceId: string,
): Promise<BluetoothDevice | null> {
	// getDevices is not available on every Chrome release; without it a
	// reload loses the silent-reconnect path until the next manual print.
	if (typeof navigator.bluetooth.getDevices !== "function") {
		return null;
	}
	const devices = await navigator.bluetooth.getDevices();
	return devices.find((device) => device.id === deviceId) ?? null;
}

// The printer this laptop last used may belong to the Store next door, so it
// only counts if this Store registered it.
const isRegistered = (device: BluetoothDevice, deviceNames: string[]) =>
	device.name !== undefined && deviceNames.includes(device.name);

async function resolvePrinter({
	allowPairing,
	deviceNames,
}: PrintOptions): Promise<ConnectedPrinter> {
	if (deviceNames.length === 0) {
		throw new NoRegisteredDeviceError();
	}

	if (
		cached?.device.gatt?.connected &&
		isRegistered(cached.device, deviceNames)
	) {
		return cached;
	}

	const { deviceId } = usePrinterStore.getState();
	if (deviceId) {
		const known = cached?.device ?? (await findGrantedDevice(deviceId));
		if (known && isRegistered(known, deviceNames)) {
			if (!allowPairing) {
				// Auto-print: a paired printer that is off or out of range is a real
				// fault, so it throws rather than reading as "not paired".
				return await connect(known);
			}
			try {
				return await connect(known);
			} catch {
				// A manual print can re-pair, so a wrongly picked or replaced
				// printer that fails falls through to the picker.
			}
		}
	}

	if (!allowPairing) {
		throw new PrinterNotPairedError();
	}

	// A printer still connected here is another Store's, and it takes one
	// connection at a time: staying on it would stop that cashier printing.
	cached?.device.gatt?.disconnect();

	const device = await navigator.bluetooth.requestDevice({
		filters: deviceNames.map((name) => ({ name })),
		optionalServices: PRINTER_SERVICES,
	});
	const printer = await connect(device);
	usePrinterStore.getState().setDeviceId(device.id);
	return printer;
}

// Registering a printer: the cashier picks from every nearby device, and one
// connect proves it is in range before the Store saves its name. Nothing prints.
export async function pairBluetoothDevice(): Promise<string> {
	if (!navigator.bluetooth) {
		throw new Error("Bluetooth is not available in this browser");
	}

	const device = await navigator.bluetooth.requestDevice({
		acceptAllDevices: true,
		optionalServices: PRINTER_SERVICES,
	});
	if (!device.name) {
		throw new Error("This device has no Bluetooth name and cannot be saved");
	}

	// Not this counter's printer yet: registering Kasir 2's printer from Kasir 1's
	// laptop would send Kasir 1's next Receipt across the shop. It is handed
	// straight back too, since these boards take one connection at a time.
	const inUse = cached;
	await connect(device);
	cached = inUse;
	device.gatt?.disconnect();

	return device.name;
}

async function printNow(data: Uint8Array, options: PrintOptions) {
	if (!navigator.bluetooth) {
		throw new Error("Bluetooth is not available in this browser");
	}

	const { characteristic } = await resolvePrinter(options);

	for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
		const chunk = data.slice(offset, offset + CHUNK_SIZE);
		if (characteristic.properties.writeWithoutResponse) {
			await characteristic.writeValueWithoutResponse(chunk);
			await sleep(CHUNK_DELAY_MS);
		} else {
			await characteristic.writeValue(chunk);
		}
	}
}

// An auto-print racing a manual reprint would mix two Receipts on the paper,
// so every print waits for the one before.
let printQueue: Promise<void> = Promise.resolve();

export const webBluetoothTransport: PrinterTransport = {
	print(data, options) {
		const task = printQueue
			.catch(() => {
				// A failed print must not poison the queue for the next one.
			})
			.then(() => printNow(data, options));
		printQueue = task.catch(() => {
			// Same: the caller sees the rejection via `task`; the queue moves on.
		});
		return task;
	},
};
