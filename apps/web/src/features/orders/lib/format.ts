export const formatOrderDateTime = (value: string): string =>
	new Date(value).toLocaleString("en-ID", {
		dateStyle: "medium",
		timeStyle: "short",
	});
