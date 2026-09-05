import { usePrinterStore } from "@/stores/printer-store";
import {
	PrinterNotPairedError,
	type PrinterTransport,
	type PrintOptions,
	type PrintResult,
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

// Chromium never rejects gatt.connect() for an off/out-of-range device — the
// promise stays pending until the device advertises again (crbug.com/666377).
// Unbounded, one dead connect would wedge the serialized print queue for the
// whole session, so cap the wait and cancel the pending request on timeout.
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
			// An admin laptop carried to another store pairs that store's
			// printer while this one is still connected; when this one later
			// drops, it must not wipe the live handle.
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

// A store with a printer on record only accepts that printer — the device this
// browser last used may be the neighbouring store's. A store with none yet
// takes whatever prints.
const isStorePrinter = (device: BluetoothDevice, printerName: string | null) =>
	printerName === null || device.name === printerName;

async function resolvePrinter({
	allowPairing,
	printerName,
}: PrintOptions): Promise<ConnectedPrinter> {
	if (
		cached?.device.gatt?.connected &&
		isStorePrinter(cached.device, printerName)
	) {
		return cached;
	}

	const { deviceId } = usePrinterStore.getState();
	if (deviceId) {
		const known = cached?.device ?? (await findGrantedDevice(deviceId));
		if (known && isStorePrinter(known, printerName)) {
			if (!allowPairing) {
				// Auto-print: a paired-but-unreachable printer is a real fault
				// (off, out of range) — let it throw instead of degrading to
				// "not paired".
				return await connect(known);
			}
			try {
				return await connect(known);
			} catch {
				// Manual print is a pairing gesture: a failing known device must
				// not block re-pairing forever (mis-picked device, replaced
				// printer) — fall through to the picker instead.
			}
		}
	}

	if (!allowPairing) {
		throw new PrinterNotPairedError();
	}

	// Any live handle here is another store's printer. Budget boards accept one
	// central at a time, so release it rather than keep that printer busy.
	cached?.device.gatt?.disconnect();

	const device = await navigator.bluetooth.requestDevice(
		printerName
			? { filters: [{ name: printerName }], optionalServices: PRINTER_SERVICES }
			: { acceptAllDevices: true, optionalServices: PRINTER_SERVICES },
	);
	const printer = await connect(device);
	// Persist only after a successful connect — the acceptAllDevices chooser
	// lists every nearby BLE device, and a mis-pick must not become the
	// remembered printer.
	usePrinterStore.getState().setDeviceId(device.id);
	return printer;
}

async function printNow(
	data: Uint8Array,
	options: PrintOptions,
): Promise<PrintResult> {
	if (!navigator.bluetooth) {
		throw new Error("Bluetooth is not available in this browser");
	}

	const { device, characteristic } = await resolvePrinter(options);

	for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
		const chunk = data.slice(offset, offset + CHUNK_SIZE);
		if (characteristic.properties.writeWithoutResponse) {
			await characteristic.writeValueWithoutResponse(chunk);
			await sleep(CHUNK_DELAY_MS);
		} else {
			await characteristic.writeValue(chunk);
		}
	}

	return { deviceName: device.name ?? null };
}

// Prints share one characteristic — interleaved chunk loops (auto-print
// racing a manual reprint) would garble two byte streams on the paper, so
// every print queues behind the previous one.
let printQueue: Promise<unknown> = Promise.resolve();

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
