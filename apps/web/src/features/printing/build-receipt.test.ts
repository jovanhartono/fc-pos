import { describe, expect, test } from "bun:test";
import type { OrderReceipt } from "@/lib/api";
import { buildReceiptEscPos } from "./build-receipt";

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
		name: "Fresclean Kemang",
		address: "Jl. Kemang Raya No. 12, Jakarta",
		phone_number: "081234567890",
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
	services: [
		{
			id: 1,
			item_code: "#JKT/06072026/12/S001",
			status: "queued",
			subtotal: "75000.00",
			brand: "Nike",
			color: "Putih",
			model: "AF1",
			size: "42",
			notes: "Sol kanan lepas sedikit",
			service: { name: "Deep Clean" },
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

const decodeText = (bytes: Uint8Array): string =>
	new TextDecoder().decode(bytes);

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
		expect(text).toContain("Deep Clean");
		expect(text).toContain("Nike - AF1 - Putih - 42");
		expect(text).toContain("#JKT/06072026/12/S001");
		expect(text).toContain("  * Sol kanan lepas sedikit");
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
		const nonAscii = asArray.filter((byte) => byte > 0x7e);
		expect(nonAscii).toEqual([]);
	});

	test("line that exactly fills 48 columns keeps every character", () => {
		const bytes = buildReceiptEscPos(
			{
				...baseReceipt,
				services: [
					{
						...baseReceipt.services[0],
						// "  " + 38-char details + "Rp75.000" = exactly 48 columns.
						brand: "ABCDEFGHIJKLMNOPQRS",
						subtotal: "75000",
					},
				],
			},
			"http://localhost/track",
		);
		const text = decodeText(bytes);

		expect(text).toContain("Putih - 42Rp75.000");
	});

	test("long item note wraps inside 48 columns keeping the item indent", () => {
		const bytes = buildReceiptEscPos(
			{
				...baseReceipt,
				services: [
					{
						...baseReceipt.services[0],
						notes:
							"jangan pakai pemutih karena bahannya sensitif dan mudah luntur",
					},
				],
			},
			"http://localhost/track",
		);
		const lines = decodeText(bytes).split("\n");
		const start = lines.findIndex((line) => line.startsWith("  * jangan"));

		expect(start).toBeGreaterThan(-1);
		// Continuation stays indented under the item, not flush at column 0.
		expect(lines[start + 1]).toMatch(/^ {2}\S/);
		for (const line of [lines[start], lines[start + 1]]) {
			expect(line.length).toBeLessThanOrEqual(48);
		}
	});

	test("unbreakable long token in a note hard-splits inside 48 columns", () => {
		const bytes = buildReceiptEscPos(
			{
				...baseReceipt,
				services: [
					{
						...baseReceipt.services[0],
						notes: "https://instagram.com/p/Cx1234567890abcdefghijklmnop",
					},
				],
			},
			"http://localhost/track",
		);
		const lines = decodeText(bytes).split("\n");
		const start = lines.findIndex((line) => line.startsWith("  * https://"));

		expect(start).toBeGreaterThan(-1);
		// Continuation stays indented, and no line exceeds the printer width.
		expect(lines[start + 1]).toMatch(/^ {2}\S/);
		for (const line of [lines[start], lines[start + 1]]) {
			expect(line.length).toBeLessThanOrEqual(48);
		}
	});

	test("voided lines are marked on reprint", () => {
		const bytes = buildReceiptEscPos(
			{
				...baseReceipt,
				services: [{ ...baseReceipt.services[0], status: "refunded" }],
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
				...baseReceipt,
				status: "cancelled",
				payment_status: "unpaid",
				paymentMethod: null,
				services: [{ ...baseReceipt.services[0], status: "cancelled" }],
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
