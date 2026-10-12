export const numberFormatter = new Intl.NumberFormat("en-ID");

export const oneDecimalFormatter = new Intl.NumberFormat("en-ID", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});

export const percentFormatter = new Intl.NumberFormat("en-ID", {
	style: "percent",
	maximumFractionDigits: 1,
});

// Rates stacked in one column keep the same width: "7,0%" beside "6,7%".
export const fixedPercentFormatter = new Intl.NumberFormat("en-ID", {
	style: "percent",
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});
