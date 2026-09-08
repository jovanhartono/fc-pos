import dayjs from "dayjs";
import type { OrderReceipt } from "@/lib/api";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { formatMoney as money, parseMoney } from "@/shared/money";
import { EscPosBuilder, toPrintableAscii } from "./escpos";
import { RECEIPT_LOGO } from "./receipt-logo";

// CBT-80: 576 printable dots / 12-dot Font A glyphs.
const WIDTH = 48;
const DIVIDER = "-".repeat(WIDTH);

const FOOTER_THANKS = "Terima kasih - Fresclean";
const FOOTER_DISCLAIMER =
	"Barang tidak diambil lebih dari 30 hari di luar tanggung jawab kami. " +
	"Kerusakan bawaan sesuai persetujuan saat serah terima.";

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

const wrap = (text: string, indent = ""): string[] => {
	const lines: string[] = [];
	const limit = WIDTH - indent.length;
	let current = "";
	for (const word of toPrintableAscii(text).split(/\s+/)) {
		// A token wider than the line (URL, long reference code) has no
		// whitespace to break on — hard-split it, filling the current line
		// first, so no line ever exceeds WIDTH and loses its indent.
		let piece = word;
		while (piece.length > 0) {
			const candidate = current ? `${current} ${piece}` : piece;
			if (candidate.length <= limit) {
				current = candidate;
				break;
			}
			if (current) {
				const room = limit - current.length - 1;
				if (room > 0 && piece.length > limit) {
					current = `${current} ${piece.slice(0, room)}`;
					piece = piece.slice(room);
				}
				lines.push(indent + current);
				current = "";
			} else {
				lines.push(indent + piece.slice(0, limit));
				piece = piece.slice(limit);
			}
		}
	}
	if (current) {
		lines.push(indent + current);
	}
	return lines;
};

const infoRow = (label: string, value: string): string =>
	`${label.padEnd(9)} : ${value}`;

export const buildReceiptEscPos = (
	receipt: OrderReceipt,
	trackingUrl: string,
): Uint8Array => {
	const discount = parseMoney(receipt.discount);
	const campaignDiscount = receipt.campaigns.reduce(
		(sum, entry) => sum + parseMoney(entry.applied_amount),
		0,
	);
	const manualDiscount = Math.max(discount - campaignDiscount, 0);
	const net = parseMoney(receipt.total) - discount;
	const isPaid = receipt.payment_status === "paid";
	const isCancelled = receipt.status === "cancelled";

	const b = new EscPosBuilder();
	b.init();

	// Header: the wordmark already says Fresclean, so the store is identified by
	// its address and phone only.
	b.align("center");
	if (RECEIPT_LOGO) {
		b.raster(RECEIPT_LOGO).feed(1);
	}
	if (receipt.store.address) {
		b.lines(wrap(receipt.store.address));
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

	// Line items — one header per physical object, its treatments beneath
	// (ADR-0017): an upsold pair prints its tag and descriptors once, not
	// once per treatment sold against it.
	if (receipt.items.length > 0) {
		b.bold(true).line("LAYANAN").bold(false);
		for (const [index, item] of receipt.items.entries()) {
			if (index > 0) {
				b.line();
			}
			// The bold row is what the counter's eye lands on to find one pair
			// of shoes among five on the same receipt; an Item logged without
			// brand or model has only its tag to be found by.
			const details = getOrderServiceItemDetails(item);
			b.bold(true)
				.lines(wrap(details ?? item.item_code))
				.bold(false);
			if (details) {
				b.line(item.item_code);
			}
			for (const line of item.services) {
				// Reprints happen after lines can be voided (ADR-0016 sanctions
				// reprints) — an unmarked voided line reads as a live claim.
				const voided =
					line.status === "cancelled"
						? " (BATAL)"
						: line.status === "refunded"
							? " (REFUND)"
							: "";
				b.line(
					row(
						`  ${line.service?.name ?? "Layanan"}${voided}`,
						money(line.subtotal),
					),
				);
				if (line.notes?.trim()) {
					b.lines(wrap(`* ${line.notes.trim()}`, "    "));
				}
			}
		}
	}
	if (receipt.products.length > 0) {
		if (receipt.items.length > 0) {
			b.line();
		}
		b.bold(true).line("PRODUK").bold(false);
		for (const line of receipt.products) {
			const voided = line.cancelled_at
				? " (BATAL)"
				: line.refunded_at
					? " (REFUND)"
					: "";
			b.bold(true)
				.line(`${line.product?.name ?? "Produk"}${voided}`)
				.bold(false);
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
	if (isCancelled) {
		b.bold(true).line("ORDER DIBATALKAN").bold(false);
	} else {
		b.line(
			isPaid
				? `Pembayaran: LUNAS - ${receipt.paymentMethod?.name ?? "-"}`
				: "Pembayaran: BELUM LUNAS - bayar saat pengambilan",
		);
	}
	b.line(DIVIDER);

	// Notes — the customer's instruction for the treatment, so it sits with the
	// order rather than stranded under the QR where nobody reads it.
	const notes = receipt.notes?.trim();
	if (notes) {
		b.lines(wrap(`Catatan: ${notes}`));
		b.line(DIVIDER);
	}

	// Pickup code — the claim ticket (ADR-0016). A cancelled Order has nothing
	// to claim, so it gets no live-looking code.
	b.align("center");
	if (!isCancelled) {
		b.line("KODE PENGAMBILAN");
		b.size("double")
			.line(receipt.pickup_code.split("").join(" "))
			.size("normal");
		b.line("Tunjukkan kode ini saat mengambil");
		b.feed(1);
	}

	// Tracking QR
	b.qr(trackingUrl);
	b.line("Scan untuk cek status order");

	// Footer
	b.line(DIVIDER);
	b.line(FOOTER_THANKS);
	b.align("left").lines(wrap(FOOTER_DISCLAIMER));

	b.feed(4).cut();
	return b.build();
};
