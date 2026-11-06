import { renderSVG } from "uqr";

interface QrisSource {
	qr_content: string | null;
	qr_image_url: string | null;
}

// DOKU sends the QRIS as text, drawn here on the phone; Midtrans sends an
// image. null = no QR, only a page to open.
export const qrisImageSrc = ({ qr_content, qr_image_url }: QrisSource) =>
	qr_content
		? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(qr_content))}`
		: qr_image_url;

export const hasQris = (charge: QrisSource | null | undefined) =>
	Boolean(charge?.qr_content || charge?.qr_image_url);
