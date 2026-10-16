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
}

export const buildPickupNoticeMessage = ({
	customerName,
	orderCode,
	pickupCode,
	total,
	isPaid,
	trackingUrl,
}: PickupNoticeMessageInput): string => {
	const paymentLines = isPaid
		? ["Status Pembayaran: *LUNAS*"]
		: [
				"Status Pembayaran: *BELUM LUNAS*",
				"",
				`Untuk pelunasan pembayaran bisa dilakukan dengan transfer ke rekening *${BANK_ACCOUNT}*`,
			];

	return [
		`Halo, ${customerName}!`,
		"Kami ingin menginformasikan bahwa barang anda sudah siap untuk diambil dengan rincian sebagai berikut:",
		"",
		`Nomor Invoice: ${orderCode}`,
		`Kode Pengambilan: *${pickupCode}*`,
		`Lacak pesanan: ${trackingUrl}`,
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
