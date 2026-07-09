import dayjs from "dayjs";
import type { OrderReceipt } from "@/lib/api";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { formatIDRCurrency } from "@/shared/utils";
import { EscPosBuilder, toPrintableAscii } from "./escpos";
import { RECEIPT_LOGO } from "./receipt-logo";

// CBT-80: 576 printable dots / 12-dot Font A glyphs.
const WIDTH = 48;
const DIVIDER = "-".repeat(WIDTH);

const FOOTER_THANKS = "Terima kasih - Fresclean";
const FOOTER_DISCLAIMER =
	"Barang tidak diambil lebih dari 30 hari di luar tanggung jawab kami. " +
	"Kerusakan bawaan sesuai persetujuan saat serah terima.";

const money = (value: string | number | null | undefined): string =>
	formatIDRCurrency(String(Number(value ?? 0)));

// Measure and pad on the ASCII-coerced text — escpos.text() coerces before
// encoding, so raw .length would drift from the printed column count whenever
// a field holds a char that NFKD expands ("½"→"12") or drops ("—"→"").
const row = (leftRaw: string, rightRaw: string): string => {
	const left = toPrintableAscii(leftRaw);
	const right = toPrintableAscii(rightRaw);
	const gap = WIDTH - left.length - right.length;
	if (gap < 0) {
		const trimmed = left.slice(0, Math.max(WIDTH - right.length - 1, 0));
		return `${trimmed} ${right}`;
	}
	return `${left}${" ".repeat(gap)}${right}`;
};

const wrap = (text: string): string[] => {
	const lines: string[] = [];
	let current = "";
	for (const word of toPrintableAscii(text).split(/\s+/)) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length > WIDTH && current) {
			lines.push(current);
			current = word;
		} else {
			current = candidate;
		}
	}
	if (current) {
		lines.push(current);
	}
	return lines;
};

const infoRow = (label: string, value: string): string =>
	`${label.padEnd(9)} : ${value}`;

export const buildReceiptEscPos = (
	receipt: OrderReceipt,
	trackingUrl: string,
): Uint8Array => {
	const discount = Number(receipt.discount ?? 0);
	const campaignDiscount = receipt.campaigns.reduce(
		(sum, entry) => sum + Number(entry.applied_amount ?? 0),
		0,
	);
	const manualDiscount = Math.max(discount - campaignDiscount, 0);
	const net = Number(receipt.total ?? 0) - discount;
	const isPaid = receipt.payment_status === "paid";

	const b = new EscPosBuilder();
	b.init();

	// Header
	b.align("center");
	if (RECEIPT_LOGO) {
		b.raster(RECEIPT_LOGO).feed(1);
	}
	b.size("double").line(receipt.store.name).size("normal");
	if (receipt.store.address) {
		for (const line of wrap(receipt.store.address)) {
			b.line(line);
		}
	}
	b.line(receipt.store.phone_number);
	b.line(DIVIDER);

	// Order identity
	b.align("left");
	b.line(infoRow("No. Order", receipt.code));
	b.line(
		infoRow("Tanggal", dayjs(receipt.created_at).format("DD/MM/YYYY HH:mm")),
	);
	b.line(infoRow("Kasir", receipt.createdBy.name));
	b.line(infoRow("Pelanggan", receipt.customer.name));
	b.line(infoRow("Telepon", receipt.customer.phone_number));
	b.line(DIVIDER);

	// Line items
	if (receipt.services.length > 0) {
		b.bold(true).line("LAYANAN").bold(false);
		for (const line of receipt.services) {
			b.line(line.service?.name ?? "Layanan");
			const details = getOrderServiceItemDetails(line);
			b.line(row(details ? `  ${details}` : "", money(line.subtotal)));
			if (line.item_code) {
				b.line(`  ${line.item_code}`);
			}
		}
	}
	if (receipt.products.length > 0) {
		if (receipt.services.length > 0) {
			b.line();
		}
		b.bold(true).line("PRODUK").bold(false);
		for (const line of receipt.products) {
			b.line(line.product?.name ?? "Produk");
			b.line(row(`  ${line.qty} x ${money(line.price)}`, money(line.subtotal)));
		}
	}
	b.line(DIVIDER);

	// Totals
	b.line(row("Subtotal", money(receipt.total)));
	for (const entry of receipt.campaigns) {
		const label = entry.campaign
			? `${entry.campaign.code} - ${entry.campaign.name}`
			: "Promo";
		b.line(row(label, `-${money(entry.applied_amount)}`));
	}
	if (manualDiscount > 0) {
		b.line(row("Diskon manual", `-${money(manualDiscount)}`));
	}
	b.bold(true)
		.line(row("TOTAL", money(net)))
		.bold(false);
	b.line();
	b.line(
		isPaid
			? `Pembayaran: LUNAS - ${receipt.paymentMethod?.name ?? "-"}`
			: "Pembayaran: BELUM LUNAS - bayar saat pengambilan",
	);
	b.line(DIVIDER);

	// Pickup code — the claim ticket (ADR-0016)
	b.align("center");
	b.line("KODE PENGAMBILAN");
	b.size("double").line(receipt.pickup_code.split("").join(" ")).size("normal");
	b.line("Tunjukkan kode ini saat mengambil");
	b.feed(1);

	// Tracking QR
	b.qr(trackingUrl);
	b.line("Scan untuk cek status order");

	// Notes
	if (receipt.notes?.trim()) {
		b.line(DIVIDER);
		b.align("left");
		for (const line of wrap(`Catatan: ${receipt.notes.trim()}`)) {
			b.line(line);
		}
		b.align("center");
	}

	// Footer
	b.line(DIVIDER);
	b.line(FOOTER_THANKS);
	for (const line of wrap(FOOTER_DISCLAIMER)) {
		b.line(line);
	}

	b.feed(4).cut();
	return b.build();
};
