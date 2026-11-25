import {
  PHOTO_MAX_DIMENSION,
  PHOTO_MAX_PASSTHROUGH_BYTES,
  PHOTO_WEBP_QUALITY,
} from "@fresclean/api/rules";

const WEBP_QUALITY = PHOTO_WEBP_QUALITY / 100;

// Safari can't encode WebP, so iPad photos go up as JPEG; kept high so the faint
// discoloration a Complaint is argued from survives the trip.
const JPEG_QUALITY = 0.88;

const PASSTHROUGH_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const FILE_EXTENSION = /\.[^.]*$/u;

export interface EncodedUpload {
  blob: Blob;
  extension: string;
  type: string;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  // oxlint-disable-next-line promise/avoid-new -- canvas.toBlob only takes a callback
  new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });

// A device that can't encode WebP silently hands back a heavier PNG, so prove support
// before the shop uplink pays for it.
const canEncodeWebp = async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;

  try {
    const probe = await toBlob(canvas, "image/webp", WEBP_QUALITY);
    return probe?.type === "image/webp";
  } catch {
    return false;
  }
};

// WebP where the device can encode it, JPEG on the iPads that can't.
export const encodeForUpload = async (
  canvas: HTMLCanvasElement,
  supportsWebp?: boolean
): Promise<EncodedUpload> => {
  if (supportsWebp ?? (await canEncodeWebp())) {
    const blob = await toBlob(canvas, "image/webp", WEBP_QUALITY);
    // Check the real encode too: a device may manage WebP at 1px but swap in a PNG at
    // 2560px, which would be stored labelled image/webp.
    if (blob?.type === "image/webp") {
      return { blob, extension: "webp", type: "image/webp" };
    }
  }

  const blob = await toBlob(canvas, "image/jpeg", JPEG_QUALITY);
  if (!blob) {
    throw new Error("Couldn't read this image");
  }

  return { blob, extension: "jpg", type: "image/jpeg" };
};

export const normalizeImageFile = async (file: File): Promise<File> => {
  // An iPhone HEIC becomes a JPEG here or is refused, never stored unviewable. from-image
  // bakes in the rotation while EXIF is still there, or a sideways-held photo is stored sideways.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Unsupported image type");
  }

  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const isInBudget =
      longEdge <= PHOTO_MAX_DIMENSION &&
      file.size <= PHOTO_MAX_PASSTHROUGH_BYTES &&
      PASSTHROUGH_TYPES.has(file.type);

    // Asked once: a five-photo gallery pick was otherwise testing the device ten times.
    const supportsWebp = await canEncodeWebp();

    // A WebP in budget goes up untouched; a JPEG or PNG only where the device can't encode
    // WebP, since converting here halves what the shop uplink carries.
    if (isInBudget && (file.type === "image/webp" || !supportsWebp)) {
      return file;
    }

    const scale = Math.min(1, PHOTO_MAX_DIMENSION / longEdge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Couldn't read this image");
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const { blob, extension, type } = await encodeForUpload(
      canvas,
      supportsWebp
    );

    return new File(
      [blob],
      `${file.name.replace(FILE_EXTENSION, "")}.${extension}`,
      { type }
    );
  } finally {
    bitmap.close();
  }
};
