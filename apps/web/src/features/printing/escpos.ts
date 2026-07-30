const ESC = 0x1b;
const GS = 0x1d;

const ALIGN_MODES = { left: 0, center: 1, right: 2 } as const;

export interface RasterBitmap {
	widthBytes: number;
	height: number;
	data: Uint8Array;
}

// Budget ESC/POS firmware renders bytes outside the active codepage as
// garbage, so text is coerced to plain ASCII before encoding.
export const toPrintableAscii = (value: string): string =>
	value
		.replaceAll("\u00a0", " ")
		.replaceAll("·", "-")
		.normalize("NFKD")
		.replaceAll(/[^\n -~]/g, "");

export class EscPosBuilder {
	private readonly bytes: number[] = [];
	private readonly encoder = new TextEncoder();

	raw(...values: number[]): this {
		this.bytes.push(...values);
		return this;
	}

	init(): this {
		return this.raw(ESC, 0x40);
	}

	text(value: string): this {
		this.bytes.push(...this.encoder.encode(toPrintableAscii(value)));
		return this;
	}

	line(value = ""): this {
		return this.text(`${value}\n`);
	}

	align(mode: keyof typeof ALIGN_MODES): this {
		return this.raw(ESC, 0x61, ALIGN_MODES[mode]);
	}

	bold(on: boolean): this {
		return this.raw(ESC, 0x45, on ? 1 : 0);
	}

	size(mode: "normal" | "double"): this {
		return this.raw(GS, 0x21, mode === "double" ? 0x11 : 0x00);
	}

	feed(lines: number): this {
		return this.raw(ESC, 0x64, lines);
	}

	// GS ( k sequence: model 2, module size 6, error correction M, store, print.
	qr(data: string): this {
		const payload = this.encoder.encode(data);
		const length = payload.length + 3;
		this.raw(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
		this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);
		this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
		this.raw(
			GS,
			0x28,
			0x6b,
			length & 0xff,
			(length >> 8) & 0xff,
			0x31,
			0x50,
			0x30,
		);
		this.bytes.push(...payload);
		return this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
	}

	// GS v 0 — 1-bit raster image.
	raster(bitmap: RasterBitmap): this {
		this.raw(
			GS,
			0x76,
			0x30,
			0x00,
			bitmap.widthBytes & 0xff,
			(bitmap.widthBytes >> 8) & 0xff,
			bitmap.height & 0xff,
			(bitmap.height >> 8) & 0xff,
		);
		this.bytes.push(...bitmap.data);
		return this;
	}

	cut(): this {
		return this.raw(GS, 0x56, 0x42, 0x00);
	}

	build(): Uint8Array {
		return Uint8Array.from(this.bytes);
	}
}
