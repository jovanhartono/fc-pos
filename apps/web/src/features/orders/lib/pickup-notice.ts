import dayjs from "dayjs";
import { formatMoneyParts } from "@/shared/money";

const BANK_ACCOUNT = "BCA 7570751471 (Jovanus)";
const SALES_PHONE = "+62 857-2322-0022";

interface PickupNoticeMessageInput {
	customerName: string;
	orderCode: string;
	pickupCode: string;
	total: number;
	isPaid: boolean;
	trackingUrl: string;
	// With a gateway set up, the Customer pays on the Track page instead of
	// transferring to the shop's account.
	canPayOnline: boolean;
}

export const buildPickupNoticeMessage = ({
	customerName,
	orderCode,
	pickupCode,
	total,
	isPaid,
	trackingUrl,
	canPayOnline,
}: PickupNoticeMessageInput): string => {
	// The Track page is also where they pay, so one link does both jobs.
	const isPayOnTrack = !isPaid && canPayOnline;
	const trackLabel = isPayOnTrack ? "Lacak & bayar pesanan" : "Lacak pesanan";
	const bankLines = canPayOnline
		? []
		: [
				"",
				`Untuk pelunasan pembayaran bisa dilakukan dengan transfer ke rekening *${BANK_ACCOUNT}*`,
			];
	const paymentLines = isPaid
		? ["Status Pembayaran: *LUNAS*"]
		: ["Status Pembayaran: *BELUM LUNAS*", ...bankLines];

	return [
		`Halo, ${customerName}!`,
		"Kami ingin menginformasikan bahwa barang anda sudah siap untuk diambil dengan rincian sebagai berikut:",
		"",
		`Nomor Invoice: ${orderCode}`,
		`Kode Pengambilan: *${pickupCode}*`,
		`${trackLabel}: ${trackingUrl}`,
		"",
		`Total Transaksi: Rp ${formatMoneyParts(total).amount},00`,
		...paymentLines,
		"",
		"*PENTING*: Batas waktu pengambilan barang adalah *1 Bulan* semenjak pesan ini diterima. Kami tidak bertanggung jawab atas segala kerusakan atau kehilangan terhadap barang anda diluar dari periode tersebut.",
		"Kami hanya menerima keluhan terhadap jasa kami maksimal *1x24 Jam* setelah pengambilan barang.",
		"",
		`Jika anda memiliki saran atau kritik tentang kami, silahkan hubungi sales representatif kami: ${SALES_PHONE}`,
		"",
		"Best Regards, Fresclean Indonesia.",
	].join("\n");
};

// Customers' numbers are stored as +62812…; wa.me wants the digits only.
export const whatsappUrl = (phone: string, text: string): string =>
	`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

export const formatNoticeTime = (value: string): string =>
	dayjs(value).format("D MMM, HH:mm");
