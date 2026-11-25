// The counter and the server encode photos the same way, so each is lossy-compressed once (ADR-0030).

// Big enough that a 5mm stain still shows in a photo of the whole Item, what a Complaint turns on.
export const PHOTO_MAX_DIMENSION = 2560;

// On the server's 1-100 scale; the browser's canvas takes it divided by 100.
export const PHOTO_WEBP_QUALITY = 85;

// A lossless WebP or a screenshot within the bound can run to tens of MB and load slowly for
// everyone opening the gallery. Set above a full camera photo, so a live shot still passes.
export const PHOTO_MAX_PASSTHROUGH_BYTES = 4_000_000;
