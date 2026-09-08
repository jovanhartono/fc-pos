// Regenerates src/features/printing/receipt-logo.ts from the wordmark.
// Run after the logo changes: `bun run generate-receipt-logo`.
//
// The cashier's receipt is the shop's claim ticket, so the header carries the
// mark. Thermal heads only fire dots — there is no grey — so the image has to
// land as one bit per dot before it can be printed.
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE_IMAGE = "public/receipt-logo.webp";
const OUTPUT_TS = "src/features/printing/receipt-logo.ts";

// Dots, not millimetres. The printer is 576 dots across (48 columns of the
// 12-dot font). Full width so the wordmark reads on the paper. Every dot is
// 1/8 byte over Bluetooth: the trimmed wordmark adds ~1.7s before the receipt.
const TARGET_WIDTH = 576;

// Anti-aliased edges arrive as grey; below mid-grey fires the dot.
const INK_THRESHOLD = 128;

interface Bitmap {
	width: number;
	height: number;
	// One entry per pixel, true where the dot should fire.
	ink: boolean[];
}

const rasterizeToBmp = (imagePath: string, width: number): Buffer => {
	const bmpPath = join(tmpdir(), `receipt-logo-${width}.bmp`);
	// sips ships with macOS and reads WebP; -Z fits the long edge to `width`.
	execFileSync("sips", [
		"-s",
		"format",
		"bmp",
		"-Z",
		String(width),
		imagePath,
		"--out",
		bmpPath,
	]);
	const bmp = readFileSync(bmpPath);
	unlinkSync(bmpPath);
	return bmp;
};

const decodeBmp = (bmp: Buffer): Bitmap => {
	const pixelOffset = bmp.readUInt32LE(10);
	const width = bmp.readInt32LE(18);
	const signedHeight = bmp.readInt32LE(22);
	const bitsPerPixel = bmp.readUInt16LE(28);

	if (bitsPerPixel !== 32 && bitsPerPixel !== 24) {
		throw new Error(
			`Expected 24/32-bit BMP from sips, got ${bitsPerPixel}-bit`,
		);
	}
	const bytesPerPixel = bitsPerPixel / 8;

	// A negative height means sips wrote the rows top-down; positive is the
	// BMP default of bottom-up, which has to be flipped back.
	const height = Math.abs(signedHeight);
	const isTopDown = signedHeight < 0;
	// BMP rows are padded to 4-byte boundaries.
	const rowBytes = Math.ceil((width * bytesPerPixel) / 4) * 4;

	const ink: boolean[] = [];
	for (let y = 0; y < height; y++) {
		const sourceRow = isTopDown ? y : height - 1 - y;
		let index = pixelOffset + sourceRow * rowBytes;
		for (let x = 0; x < width; x++) {
			const blue = bmp[index];
			const green = bmp[index + 1];
			const red = bmp[index + 2];
			const alpha = bytesPerPixel === 4 ? bmp[index + 3] : 255;
			index += bytesPerPixel;

			// A logo with transparency is composited over the paper first —
			// otherwise every transparent pixel reads as black ink.
			const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
			const overPaper = (luminance * alpha + 255 * (255 - alpha)) / 255;
			ink.push(overPaper < INK_THRESHOLD);
		}
	}

	return { width, height, ink };
};

// The wordmark file has blank bands above and below the letters; on paper they
// would be empty feed, so drop them. Width is kept for centring.
const trimBlankRows = ({ width, height, ink }: Bitmap): Bitmap => {
	const rowHasInk = (y: number) =>
		ink.slice(y * width, (y + 1) * width).some(Boolean);
	let top = 0;
	while (top < height && !rowHasInk(top)) {
		top++;
	}
	let bottom = height;
	while (bottom > top && !rowHasInk(bottom - 1)) {
		bottom--;
	}
	return {
		width,
		height: bottom - top,
		ink: ink.slice(top * width, bottom * width),
	};
};

// GS v 0 wants rows padded to whole bytes, most significant bit leftmost.
const packOneBitPerDot = ({ width, height, ink }: Bitmap) => {
	const widthBytes = Math.ceil(width / 8);
	const data = new Uint8Array(widthBytes * height);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (ink[y * width + x]) {
				data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
			}
		}
	}

	return { widthBytes, height, data };
};

const renderModule = (widthBytes: number, height: number, data: Uint8Array) =>
	`import type { RasterBitmap } from "./escpos";

// 1-bit raster of the Fresclean wordmark for the receipt header (GS v 0).
// Generated from ${SOURCE_IMAGE} by \`bun run generate-receipt-logo\` — edit the
// logo and rerun, never this file. Base64 keeps ${data.length} bytes to
// one reviewable line instead of ${data.length} array entries.
const WIDTH_BYTES = ${widthBytes};
const HEIGHT = ${height};
const DATA_BASE64 =
	"${Buffer.from(data).toString("base64")}";

export const RECEIPT_LOGO: RasterBitmap | null = {
	widthBytes: WIDTH_BYTES,
	height: HEIGHT,
	data: Uint8Array.from(atob(DATA_BASE64), (char) => char.charCodeAt(0)),
};
`;

// Prints the packed bitmap at 1 char per 2x4 dots so the mark can be eyeballed
// before it costs paper.
const preview = ({ width, height, ink }: Bitmap) => {
	const rows: string[] = [];
	for (let y = 0; y < height; y += 4) {
		let row = "";
		for (let x = 0; x < width; x += 2) {
			let lit = 0;
			for (let dy = 0; dy < 4; dy++) {
				for (let dx = 0; dx < 2; dx++) {
					if (ink[(y + dy) * width + (x + dx)]) {
						lit++;
					}
				}
			}
			row += lit > 5 ? "#" : lit > 2 ? "+" : lit > 0 ? "." : " ";
		}
		rows.push(row);
	}
	return rows.join("\n");
};

const bitmap = trimBlankRows(
	decodeBmp(rasterizeToBmp(SOURCE_IMAGE, TARGET_WIDTH)),
);
const { widthBytes, height, data } = packOneBitPerDot(bitmap);
writeFileSync(OUTPUT_TS, renderModule(widthBytes, height, data));

const inkedDots = bitmap.ink.filter(Boolean).length;
process.stdout.write(
	`${preview(bitmap)}\n\n${bitmap.width}x${bitmap.height} dots, ${inkedDots} inked, ${data.length} bytes -> ${OUTPUT_TS}\n`,
);
