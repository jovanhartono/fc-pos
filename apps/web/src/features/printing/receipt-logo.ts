import type { RasterBitmap } from "./escpos";

// 1-bit raster logo for the receipt header (GS v 0), generated offline from
// the brand mark. null falls back to the text-only store-name header.
export const RECEIPT_LOGO: RasterBitmap | null = null;
