const IDR = new Intl.NumberFormat("id-ID", {
	style: "currency",
	currency: "IDR",
	minimumFractionDigits: 0,
	maximumFractionDigits: 0,
});

// Money reaches the browser as a string because Postgres hands numeric back as
// one, and the counter only ever charges whole rupiah — never sen.
export const parseMoney = (value: string | number | null | undefined): number =>
	Number(value ?? 0);

// Never format an API money string directly: "45000.00" read as digits alone
// prints as Rp4.500.000, a hundred times the real price.
export const formatMoney = (
	value: string | number | null | undefined,
): string => IDR.format(parseMoney(value));
