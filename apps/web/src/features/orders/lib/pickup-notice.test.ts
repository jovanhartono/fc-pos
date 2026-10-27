import { describe, expect, test } from "bun:test";
import {
	buildPaymentLinkMessage,
	buildPickupNoticeMessage,
	whatsappUrl,
} from "./pickup-notice";

const base = {
	customerName: "Rina Kartika",
	orderCode: "#BSD/14102026/7",
	pickupCode: "482913",
	total: 385_000,
	trackingUrl: "https://pos.fresclean.id/track?code=x&phone=y",
	canPayOnline: false,
};

describe("buildPickupNoticeMessage", () => {
	test("a paid Order says LUNAS and leaves out the bank line", () => {
		const message = buildPickupNoticeMessage({ ...base, isPaid: true });

		expect(message).toContain("Halo, Rina Kartika!");
		expect(message).toContain("Nomor Invoice: #BSD/14102026/7");
		expect(message).toContain("Kode Pengambilan: *482913*");
		expect(message).toContain(
			"Lacak pesanan: https://pos.fresclean.id/track?code=x&phone=y",
		);
		expect(message).toContain(
			"Total Transaksi: Rp 385.000,00\nStatus Pembayaran: *LUNAS*\n\n*PENTING*",
		);
		expect(message).not.toContain("BCA");
		expect(message.endsWith("Best Regards, Fresclean Indonesia.")).toBe(true);
	});

	test("an unpaid Order says BELUM LUNAS and gives the bank account", () => {
		const message = buildPickupNoticeMessage({ ...base, isPaid: false });

		expect(message).toContain(
			"Status Pembayaran: *BELUM LUNAS*\n\nUntuk pelunasan pembayaran bisa dilakukan dengan transfer ke rekening *BCA 7570751471 (Jovanus)*\n\n*PENTING*",
		);
	});

	test("an unpaid Order with a gateway set up links the Track page instead", () => {
		const message = buildPickupNoticeMessage({
			...base,
			isPaid: false,
			canPayOnline: true,
		});

		expect(message).toContain(
			"Status Pembayaran: *BELUM LUNAS*\n\nBayar online: https://pos.fresclean.id/track?code=x&phone=y\n\n*PENTING*",
		);
		expect(message).not.toContain("BCA");
	});
});

describe("buildPaymentLinkMessage", () => {
	test("names the Customer, the Order, the amount and the Track page", () => {
		expect(
			buildPaymentLinkMessage({
				customerName: "Rina Kartika",
				orderCode: "#BSD/14102026/7",
				amount: 385_000,
				trackingUrl: "https://pos.fresclean.id/track?code=x&phone=y",
			}),
		).toBe(
			"Halo Rina Kartika, tagihan order #BSD/14102026/7 sebesar Rp 385.000. Bayar online: https://pos.fresclean.id/track?code=x&phone=y",
		);
	});
});

describe("whatsappUrl", () => {
	test("keeps only the phone's digits and encodes the text", () => {
		expect(whatsappUrl("+62 812-3456", "Halo *A*\nB")).toBe(
			"https://wa.me/628123456?text=Halo%20*A*%0AB",
		);
	});
});
