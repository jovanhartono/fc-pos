import { describe, expect, test } from "bun:test";
import type { OrderReceipt } from "@/lib/api";
import { buildReceiptEscPos } from "./build-receipt";
import { RECEIPT_LOGO } from "./receipt-logo";

const baseReceipt: OrderReceipt = {
	id: 12,
	code: "#JKT/06072026/12",
	created_at: "2026-07-06T07:32:00.000Z",
	notes: "Jangan pakai pemutih",
	status: "created",
	payment_status: "paid",
	total: "315000.00",
	discount: "41500.00",
	discount_source: "campaign",
	pickup_code: "482917",
	store: {
		id: 1,
		name: "Fresclean Kemang",
		address: "Jl. Kemang Raya No. 12, Jakarta",
		phone_number: "081234567890",
		printer_name: null,
	},
	customer: {
		name: "Budi Santoso",
		phone_number: "081299998888",
	},
	createdBy: {
		name: "Rina",
	},
	paymentMethod: {
		name: "QRIS",
	},
	campaigns: [
		{
			id: 1,
			applied_amount: "31500.00",
			campaign: { code: "PROMO10", name: "Promo Juli" },
		},
	],
	items: [
		{
			id: 1,
			item_code: "#JKT/06072026/12-S001",
			brand: "Nike",
			color: "Putih",
			model: "AF1",
			size: "42",
			services: [
				{
					id: 1,
					status: "queued",
					subtotal: "75000.00",
					notes: "Sol kanan lepas sedikit",
					service: { name: "Deep Clean" },
				},
			],
		},
	],
	products: [
		{
			id: 1,
			qty: 2,
			price: "45000.00",
			subtotal: "90000.00",
			cancelled_at: null,
			refunded_at: null,
			product: { name: "Shoe Cleaner 250ml" },
		},
	],
};

const withItem = (
	overrides: Partial<OrderReceipt["items"][number]>,
): OrderReceipt => ({
	...baseReceipt,
	items: [{ ...baseReceipt.items[0], ...overrides }],
});

const withService = (
	overrides: Partial<OrderReceipt["items"][number]["services"][number]>,
): OrderReceipt =>
	withItem({
		services: [{ ...baseReceipt.items[0].services[0], ...overrides }],
	});

const decodeText = (bytes: Uint8Array): string =>
	new TextDecoder().decode(bytes);

const RASTER_HEADER = [0x1d, 0x76, 0x30, 0x00];

// Index of the first byte after the header logo, or 0 when no logo is set.
const afterHeaderLogo = (bytes: number[]): number => {
	if (!RECEIPT_LOGO) {
		return 0;
	}
	const start = bytes.findIndex((_, index) =>
		RASTER_HEADER.every((byte, offset) => bytes[index + offset] === byte),
	);
	return start + RASTER_HEADER.length + 4 + RECEIPT_LOGO.data.length;
};

describe("buildReceiptEscPos", () => {
	test("produces a complete paid receipt", () => {
		const bytes = buildReceiptEscPos(
			baseReceipt,
			"http://localhost/track?code=x&phone=y",
		);
		const text = decodeText(bytes);

		// ESC @ init first, cut last.
		expect([bytes[0], bytes[1]]).toEqual([0x1b, 0x40]);
		expect([...bytes.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);

		expect(text).toContain("Fresclean Kemang");
		expect(text).toContain("No. Order : #JKT/06072026/12");
		expect(text).toContain("Kasir     : Rina");
		expect(text).toContain("Nike - AF1 - Putih - 42");
		expect(text).toContain("#JKT/06072026/12-S001");
		expect(text).toContain("  Deep Clean");
		expect(text).toContain("    * Sol kanan lepas sedikit");
		expect(text).toContain("2 x Rp45.000");
		expect(text).toContain("Rp315.000");
		expect(text).toContain("PROMO10 - Promo Juli");
		expect(text).toContain("Diskon manual");
		expect(text).toContain("-Rp10.000");
		// TOTAL = 315.000 - 41.500
		expect(text).toContain("Rp273.500");
		expect(text).toContain("Pembayaran: LUNAS - QRIS");
		expect(text).toContain("KODE PENGAMBILAN");
		expect(text).toContain("4 8 2 9 1 7");
		expect(text).toContain("http://localhost/track?code=x&phone=y");
		expect(text).toContain("Catatan: Jangan pakai pemutih");

		// GS ( k QR print command present.
		const qrPrint = [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30];
		const asArray = [...bytes];
		const hasQrPrint = asArray.some((_, index) =>
			qrPrint.every((byte, offset) => asArray[index + offset] === byte),
		);
		expect(hasQrPrint).toBe(true);

		// Every printable byte is ASCII — no codepage surprises on the printer.
		// The header logo is skipped: a 1-bit bitmap is arbitrary bytes, and the
		// guarantee being made here is about the text the cashier reads.
		const nonAscii = asArray
			.slice(afterHeaderLogo(asArray))
			.filter((byte) => byte > 0x7e);
		expect(nonAscii).toEqual([]);
	});

	test("header carries the centred brand mark", () => {
		const bytes = buildReceiptEscPos(baseReceipt, "http://localhost/track");
		const asArray = [...bytes];
		const start = asArray.findIndex((_, index) =>
			RASTER_HEADER.every((byte, offset) => asArray[index + offset] === byte),
		);

		expect(RECEIPT_LOGO).not.toBeNull();
		expect(start).toBeGreaterThan(-1);
		// ESC a 1 precedes it, or the mark prints hard against the left edge.
		expect(asArray.slice(start - 3, start)).toEqual([0x1b, 0x61, 0x01]);
		// Width and height in the command must match the bitmap that follows,
		// otherwise the printer eats receipt text as image data.
		expect(asArray.slice(start + 4, start + 8)).toEqual([
			RECEIPT_LOGO?.widthBytes ?? 0,
			0,
			RECEIPT_LOGO?.height ?? 0,
			0,
		]);
		expect(RECEIPT_LOGO?.data.length).toBe(
			(RECEIPT_LOGO?.widthBytes ?? 0) * (RECEIPT_LOGO?.height ?? 0),
		);
		// The mark must not push the store name off the top of the receipt.
		expect(decodeText(bytes)).toContain("Fresclean Kemang");
	});

	test("one Item with three treatments prints one tag and one descriptor row", () => {
		// The counter's standard upsell (ADR-0017): a pair arrives for a deep
		// clean and leaves the till as deep clean + repaint + leather care.
		// One physical object — the receipt must not read as three shoes.
		const bytes = buildReceiptEscPos(
			withItem({
				services: [
					baseReceipt.items[0].services[0],
					{
						...baseReceipt.items[0].services[0],
						id: 2,
						subtotal: "150000.00",
						notes: null,
						service: { name: "Repaint" },
					},
					{
						...baseReceipt.items[0].services[0],
						id: 3,
						subtotal: "35000.00",
						notes: null,
						service: { name: "Leather Care" },
					},
				],
			}),
			"http://localhost/track",
		);
		const text = decodeText(bytes);

		expect(text.split("Nike - AF1 - Putih - 42").length - 1).toBe(1);
		expect(text.split("#JKT/06072026/12-S001").length - 1).toBe(1);
		// Each treatment still prices on its own line — the cashier sold three.
		expect(text).toMatch(/ {2}Deep Clean +Rp75\.000/);
		expect(text).toMatch(/ {2}Repaint +Rp150\.000/);
		expect(text).toMatch(/ {2}Leather Care +Rp35\.000/);
	});

	test("item header that exactly fills 48 columns keeps every character", () => {
		const bytes = buildReceiptEscPos(
			// 29-char brand + " - AF1 - Putih - 42" = exactly 48 columns.
			withItem({ brand: "ABCDEFGHIJKLMNOPQRSTUVWXYZ123" }),
			"http://localhost/track",
		);
		const text = decodeText(bytes);

		// The full 48-char header survives unbroken — a wrap or a truncation
		// would put a newline or a cut inside it.
		expect(text).toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ123 - AF1 - Putih - 42");
	});

	test("long item note wraps inside 48 columns keeping the treatment indent", () => {
		const bytes = buildReceiptEscPos(
			withService({
				notes: "jangan pakai pemutih karena bahannya sensitif dan mudah luntur",
			}),
			"http://localhost/track",
		);
		const lines = decodeText(bytes).split("\n");
		const start = lines.findIndex((line) => line.startsWith("    * jangan"));

		expect(start).toBeGreaterThan(-1);
		// Continuation stays indented under the treatment, not flush at column 0.
		expect(lines[start + 1]).toMatch(/^ {4}\S/);
		for (const line of [lines[start], lines[start + 1]]) {
			expect(line.length).toBeLessThanOrEqual(48);
		}
	});

	test("unbreakable long token in a note hard-splits inside 48 columns", () => {
		const bytes = buildReceiptEscPos(
			withService({
				notes: "https://instagram.com/p/Cx1234567890abcdefghijklmnop",
			}),
			"http://localhost/track",
		);
		const lines = decodeText(bytes).split("\n");
		const start = lines.findIndex((line) => line.startsWith("    * https://"));

		expect(start).toBeGreaterThan(-1);
		// Continuation stays indented, and no line exceeds the printer width.
		expect(lines[start + 1]).toMatch(/^ {4}\S/);
		for (const line of [lines[start], lines[start + 1]]) {
			expect(line.length).toBeLessThanOrEqual(48);
		}
	});

	test("voided lines are marked on reprint", () => {
		const bytes = buildReceiptEscPos(
			{
				...withService({ status: "refunded" }),
				products: [{ ...baseReceipt.products[0], cancelled_at: null }],
			},
			"http://localhost/track",
		);
		const text = decodeText(bytes);

		expect(text).toContain("Deep Clean (REFUND)");
		expect(text).toContain("Shoe Cleaner 250ml");
		expect(text).not.toContain("Shoe Cleaner 250ml (BATAL)");

		const cancelledProduct = decodeText(
			buildReceiptEscPos(
				{
					...baseReceipt,
					products: [
						{
							...baseReceipt.products[0],
							cancelled_at: "2026-07-07T03:00:00.000Z",
						},
					],
				},
				"http://localhost/track",
			),
		);
		expect(cancelledProduct).toContain("Shoe Cleaner 250ml (BATAL)");
	});

	test("cancelled order prints no pickup code and no pay-at-pickup line", () => {
		const bytes = buildReceiptEscPos(
			{
				...withService({ status: "cancelled" }),
				status: "cancelled",
				payment_status: "unpaid",
				paymentMethod: null,
			},
			"http://localhost/track",
		);
		const text = decodeText(bytes);

		expect(text).toContain("ORDER DIBATALKAN");
		expect(text).toContain("Deep Clean (BATAL)");
		expect(text).not.toContain("KODE PENGAMBILAN");
		expect(text).not.toContain("4 8 2 9 1 7");
		expect(text).not.toContain("bayar saat pengambilan");
	});

	test("unpaid order prints pay-at-pickup line and no method", () => {
		const bytes = buildReceiptEscPos(
			{
				...baseReceipt,
				payment_status: "unpaid",
				paymentMethod: null,
				discount: "0.00",
				discount_source: "none",
				campaigns: [],
				notes: null,
			},
			"http://localhost/track",
		);
		const text = decodeText(bytes);

		expect(text).toContain("Pembayaran: BELUM LUNAS - bayar saat pengambilan");
		expect(text).not.toContain("LUNAS - QRIS");
		expect(text).not.toContain("Diskon manual");
		expect(text).not.toContain("Catatan:");
	});
});
