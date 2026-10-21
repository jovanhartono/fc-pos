import dayjs from "dayjs";
import type { OrderReceipt } from "@/features/orders/api";
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

// Pad the ASCII text the printer actually gets: a "½" or "—" in a field changes
// length once coerced, which would push the price column out of line.
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
		// A URL or long code in a note has no space to break on, so it is cut
		// to fit, or it would run past the paper edge and lose its indent.
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

	// Header: the wordmark already says Fresclean, so the Store is identified by
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

	b.align("left");
	b.line(infoRow("No. Order", receipt.code));
	b.line(
		infoRow("Tanggal", dayjs(receipt.created_at).format("DD/MM/YYYY HH:mm")),
	);
	b.line(infoRow("Kasir", receipt.createdBy.name));
	b.line(infoRow("Pelanggan", receipt.customer.name));
	b.line(infoRow("Telepon", receipt.customer.phone_number));
	b.line(DIVIDER);

	// One header per Item, its Services beneath (ADR-0017): a pair sold three
	// Services prints its tag and details once, not three times.
	if (receipt.items.length > 0) {
		b.bold(true).line("LAYANAN").bold(false);
		for (const [index, item] of receipt.items.entries()) {
			if (index > 0) {
				b.line();
			}
			// The bold row is how the counter finds one pair among five on a
			// Receipt; an Item logged without brand or model has only its tag.
			const details = getOrderServiceItemDetails(item);
			b.bold(true)
				.lines(wrap(details ?? item.item_code))
				.bold(false);
			if (details) {
				b.line(item.item_code);
			}
			for (const line of item.services) {
				// A reprint can come after a line is cancelled or refunded (ADR-0016);
				// unmarked, it would read as work still owed to the Customer.
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

	// The Customer's note is an instruction for the work, so it sits with the
	// Order rather than stranded under the QR where nobody reads it.
	const notes = receipt.notes?.trim();
	if (notes) {
		b.lines(wrap(`Catatan: ${notes}`));
		b.line(DIVIDER);
	}

	// Pickup code (ADR-0016). A cancelled Order has nothing to claim, so it gets
	// no live-looking code.
	b.align("center");
	if (!isCancelled) {
		b.line("KODE PENGAMBILAN");
		b.size("double")
			.line(receipt.pickup_code.split("").join(" "))
			.size("normal");
		b.line("Tunjukkan kode ini saat mengambil");
		b.feed(1);
	}

	b.qr(trackingUrl);
	b.line("Scan untuk cek status order");

	b.line(DIVIDER);
	b.line(FOOTER_THANKS);
	b.align("left").lines(wrap(FOOTER_DISCLAIMER));

	b.feed(4).cut();
	return b.build();
};
