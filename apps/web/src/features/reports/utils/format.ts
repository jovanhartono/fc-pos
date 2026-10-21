export const numberFormatter = new Intl.NumberFormat("en-ID");

// "1,204 checks", "1 check".
export const pluralCount = (count: number, word: string) =>
	`${numberFormatter.format(count)} ${word}${count === 1 ? "" : "s"}`;

export const oneDecimalFormatter = new Intl.NumberFormat("en-ID", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});

export const percentFormatter = new Intl.NumberFormat("en-ID", {
	style: "percent",
	maximumFractionDigits: 1,
});

const upToOneDecimal = new Intl.NumberFormat("en-ID", {
	maximumFractionDigits: 1,
});

// "243,7 jt" rather than "243.71M": in Indonesian a dot groups thousands and
// M is miliar, so the old label read as a far bigger number.
export const compactNumber = (value: number): string => {
	const abs = Math.abs(value);
	const sign = value < 0 ? "-" : "";
	const thousands = Math.round(abs / 1000);
	// Rp 999.800 rounds to 1.000 rb, which should read 1 jt.
	if (abs >= 1_000_000 || thousands >= 1000) {
		return `${sign}${upToOneDecimal.format(abs / 1_000_000)} jt`;
	}
	if (abs >= 1000) {
		return `${sign}${numberFormatter.format(thousands)} rb`;
	}
	return `${sign}${numberFormatter.format(Math.round(abs))}`;
};

export const compactMoney = (value: number): string =>
	value < 0 ? `-Rp ${compactNumber(-value)}` : `Rp ${compactNumber(value)}`;

// Rates stacked in one column keep the same width: "7,0%" beside "6,7%".
export const fixedPercentFormatter = new Intl.NumberFormat("en-ID", {
	style: "percent",
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});
