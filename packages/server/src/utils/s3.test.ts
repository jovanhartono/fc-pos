// Guards the two promises the damage-audit evidence rests on: a stored photo
// key resolves to a link an operator can open mid-dispute, and nothing but
// browser-renderable WebP survives the upload path.

import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { s3 } from "bun";
import { BadRequestException } from "@/errors";
import { buildMediaUrl, optimizeUploadedImage } from "@/utils/s3";

describe("buildMediaUrl", () => {
  const originalBase = process.env.CDN_BASE_URL;

  afterEach(() => {
    if (originalBase === undefined) {
      delete process.env.CDN_BASE_URL;
    } else {
      process.env.CDN_BASE_URL = originalBase;
    }
  });

  it("turns a stored key into a link the counter phone can open during a dispute", () => {
    process.env.CDN_BASE_URL = "https://cdn.fresclean.id";
    expect(buildMediaUrl("orders/812/dropoff.webp")).toBe(
      "https://cdn.fresclean.id/orders/812/dropoff.webp"
    );
  });

  it("does not double the slash when the stored key starts with one", () => {
    process.env.CDN_BASE_URL = "https://cdn.fresclean.id/";
    expect(buildMediaUrl("/orders/812/dropoff.webp")).toBe(
      "https://cdn.fresclean.id/orders/812/dropoff.webp"
    );
  });

  it("returns null for a garment with no drop-off photo on file", () => {
    expect(buildMediaUrl(null)).toBeNull();
    expect(buildMediaUrl(undefined)).toBeNull();
  });

  it("fails loudly on a misconfigured deploy instead of serving broken photo links", () => {
    delete process.env.CDN_BASE_URL;
    expect(() => buildMediaUrl("orders/812/dropoff.webp")).toThrow(
      "Missing CDN_BASE_URL configuration"
    );
  });
});

interface StubbedUpload {
  resize: unknown[];
  /** Byte range the header probe asked for, so the full download it replaces stays visible. */
  sliced: unknown[] | null;
  webp: unknown[];
  written: { bytes: Uint8Array; options: unknown }[];
}

interface StubOptions {
  decode: () => Uint8Array;
  /** What the header of the PUT object says it is, or a throw for a header nobody can read. */
  header?: (() => { format: string; height: number; width: number }) | null;
}

/** Stands in for the object the counter phone just PUT to its presigned URL. */
const stubUpload = ({ decode, header }: StubOptions) => {
  const calls: StubbedUpload = {
    resize: [],
    sliced: null,
    webp: [],
    written: [],
  };
  const transcode = () => ({
    resize: (...resizeArgs: unknown[]) => {
      calls.resize = resizeArgs;
      return {
        webp: (...webpArgs: unknown[]) => {
          calls.webp = webpArgs;
          return { bytes: async () => decode() };
        },
      };
    },
  });
  const spy = spyOn(s3, "file").mockReturnValue({
    image: transcode,
    slice: (...sliceArgs: unknown[]) => {
      calls.sliced = sliceArgs;
      return {
        image: () => ({
          metadata: () =>
            header
              ? Promise.resolve(header())
              : Promise.reject(imageFailure("ERR_IMAGE_UNKNOWN_FORMAT")),
        }),
      };
    },
    write: (bytes: Uint8Array, options: unknown) => {
      calls.written.push({ bytes, options });
      return Promise.resolve(bytes.byteLength);
    },
  } as never);

  return { calls, restore: () => spy.mockRestore() };
};

function imageFailure(code: string) {
  return Object.assign(new Error(code), { code });
}

const jpegHeader = () => ({ format: "jpeg", height: 1920, width: 2560 });
const webpHeader = () => ({ format: "webp", height: 1920, width: 2560 });

describe("optimizeUploadedImage", () => {
  let restore = () => {
    // replaced per test
  };

  afterEach(() => restore());

  it("replaces an iPad's JPEG with WebP the customer's dispute can be argued from on any phone", async () => {
    const optimized = new Uint8Array([1, 2, 3]);
    const { calls, restore: undo } = stubUpload({
      decode: () => optimized,
      header: jpegHeader,
    });
    restore = undo;

    await optimizeUploadedImage("orders/812/dropoff.jpg");

    expect(calls.resize).toEqual([
      2560,
      2560,
      { fit: "inside", withoutEnlargement: true },
    ]);
    expect(calls.webp).toEqual([{ quality: 85 }]);
    expect(calls.written).toEqual([
      { bytes: optimized, options: { type: "image/webp" } },
    ]);
  });

  it("keeps a shot the counter already encoded as WebP, sparing it a download, a transcode and a second generation", async () => {
    const { calls, restore: undo } = stubUpload({
      decode: () => {
        throw new Error(
          "must not transcode an upload that is already in budget"
        );
      },
      header: webpHeader,
    });
    restore = undo;

    await optimizeUploadedImage("orders/812/services/9/tear.webp");

    // A header-sized range, not the whole object — the saving this branch exists for.
    expect(calls.sliced).toEqual([0, 65_536]);
    expect(calls.written).toHaveLength(0);
    expect(calls.resize).toEqual([]);
  });

  it("still re-encodes a WebP that came in over the dimension bound, whoever PUT it", async () => {
    const optimized = new Uint8Array([4, 5, 6]);
    const { calls, restore: undo } = stubUpload({
      decode: () => optimized,
      header: () => ({ format: "webp", height: 3024, width: 4032 }),
    });
    restore = undo;

    await optimizeUploadedImage("orders/812/dropoff.webp");

    expect(calls.written).toEqual([
      { bytes: optimized, options: { type: "image/webp" } },
    ]);
  });

  it("treats a header it cannot read as a photo to re-encode, not as a photo to reject", async () => {
    const optimized = new Uint8Array([7, 8, 9]);
    const { calls, restore: undo } = stubUpload({
      decode: () => optimized,
      header: null,
    });
    restore = undo;

    await optimizeUploadedImage("orders/812/dropoff.jpg");

    expect(calls.written).toEqual([
      { bytes: optimized, options: { type: "image/webp" } },
    ]);
  });

  it("rejects a HEIC that slipped past the counter phone instead of keeping evidence nobody can open", async () => {
    const { calls, restore: undo } = stubUpload({
      decode: () => {
        throw imageFailure("ERR_IMAGE_FORMAT_UNSUPPORTED");
      },
      header: null,
    });
    restore = undo;

    await expect(
      optimizeUploadedImage("orders/812/dropoff.heic")
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(calls.written).toHaveLength(0);
  });

  it("rejects a photo truncated by a dropped 4G upload", async () => {
    const { restore: undo } = stubUpload({
      decode: () => {
        throw imageFailure("ERR_IMAGE_DECODE_FAILED");
      },
      header: jpegHeader,
    });
    restore = undo;

    await expect(
      optimizeUploadedImage("orders/812/services/9/tear.jpg")
    ).rejects.toThrow("Uploaded file is not a valid image");
  });

  it("surfaces an S3 outage as an outage, not as the operator's photo being bad", async () => {
    const outage = new Error("socket hang up");
    const { restore: undo } = stubUpload({
      decode: () => {
        throw outage;
      },
      header: jpegHeader,
    });
    restore = undo;

    await expect(optimizeUploadedImage("orders/812/dropoff.jpg")).rejects.toBe(
      outage
    );
  });
});
