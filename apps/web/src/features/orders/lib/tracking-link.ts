// Single source of the public /track URL contract — shared by the
// "Copy tracking link" action and the receipt QR so they can never drift.
export const buildTrackingUrl = (code: string, phone: string): string => {
	const origin = typeof window !== "undefined" ? window.location.origin : "";
	const params = new URLSearchParams({ code, phone });
	return `${origin}/track?${params.toString()}`;
};
