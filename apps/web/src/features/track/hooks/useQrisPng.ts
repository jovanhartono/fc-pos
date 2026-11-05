import { useEffect, useState } from "react";

const QR_SIZE = 960;
const QUIET_ZONE = 64;

const toPngFile = async (src: string, fileName: string) => {
	const image = new Image();
	image.crossOrigin = "anonymous";
	image.src = src;
	await image.decode();

	const canvas = document.createElement("canvas");
	canvas.width = QR_SIZE + QUIET_ZONE * 2;
	canvas.height = canvas.width;
	const context = canvas.getContext("2d");
	if (!context) {
		return null;
	}
	context.fillStyle = "white";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.imageSmoothingEnabled = false;
	context.drawImage(image, QUIET_ZONE, QUIET_ZONE, QR_SIZE, QR_SIZE);

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/png"),
	);
	return blob ? new File([blob], fileName, { type: "image/png" }) : null;
};

// A phone can't scan its own screen, so the Customer saves the QR to Photos and
// picks it in their bank app, which reads a PNG but not the SVG DOKU's QR
// arrives as. Made ahead of the tap: iPhone refuses a share sheet opened after
// a wait.
export const useQrisPng = (src: string | null, fileName: string) => {
	const [png, setPng] = useState<{ file: File; url: string } | null>(null);

	useEffect(() => {
		if (!src) {
			return;
		}
		let url: string | null = null;
		let isCurrent = true;
		toPngFile(src, fileName)
			.then((file) => {
				if (!(file && isCurrent)) {
					return;
				}
				url = URL.createObjectURL(file);
				setPng({ file, url });
			})
			// The gateway's own image may refuse to be copied; the page then keeps
			// showing it as it came.
			.catch(() => undefined);
		return () => {
			isCurrent = false;
			setPng(null);
			if (url) {
				URL.revokeObjectURL(url);
			}
		};
	}, [src, fileName]);

	return png;
};
