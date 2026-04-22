export const numberFormatter = new Intl.NumberFormat("en-ID");

export const percentFormatter = new Intl.NumberFormat("en-ID", {
	style: "percent",
	maximumFractionDigits: 1,
});
