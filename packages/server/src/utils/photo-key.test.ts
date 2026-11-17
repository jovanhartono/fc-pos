import { describe, expect, it } from "bun:test";

import {
  assertPhotoKeyUnder,
  type PhotoScope,
  STORAGE_ENV_PREFIX,
} from "@/utils/photo-key";

// A saved image_path comes from the client, so this is the one gate standing between "the
// counter's own upload" and "whatever path someone typed" — another Order's folder, another
// Item's, a `..` escape, or a key the other environment wrote.
describe("assertPhotoKeyUnder", () => {
  const itemScope: PhotoScope = { itemId: 88, kind: "item", orderId: 1042 };
  const validKey = `${STORAGE_ENV_PREFIX}orders/1042/items/88/3f9a`;

  it("accepts a key filed directly under its own scope", () => {
    expect(() => assertPhotoKeyUnder(validKey, itemScope)).not.toThrow();
  });

  it("refuses a key filed under another order's folder", () => {
    const otherOrderKey = `${STORAGE_ENV_PREFIX}orders/999/items/88/3f9a`;
    expect(() => assertPhotoKeyUnder(otherOrderKey, itemScope)).toThrow(
      "Invalid image path"
    );
  });

  it("refuses a `..` escape out of the scope's folder", () => {
    const escapeKey = `${STORAGE_ENV_PREFIX}orders/1042/items/88/..`;
    expect(() => assertPhotoKeyUnder(escapeKey, itemScope)).toThrow(
      "Invalid image path"
    );
  });

  it("refuses the scope's folder itself, with nothing filed in it", () => {
    const folderKey = `${STORAGE_ENV_PREFIX}orders/1042/items/88/`;
    expect(() => assertPhotoKeyUnder(folderKey, itemScope)).toThrow(
      "Invalid image path"
    );
  });

  it("refuses extra nesting under the scope's folder", () => {
    const nestedKey = `${STORAGE_ENV_PREFIX}orders/1042/items/88/sub/3f9a`;
    expect(() => assertPhotoKeyUnder(nestedKey, itemScope)).toThrow(
      "Invalid image path"
    );
  });

  it("refuses a thumbnail's path, which the photo sweep would delete as a leftover thumbnail", () => {
    expect(() => assertPhotoKeyUnder(`${validKey}.thumb`, itemScope)).toThrow(
      "Invalid image path"
    );
  });

  it("refuses the other environment's prefix, which every key still carries though each has its own bucket", () => {
    const otherEnvPrefix = STORAGE_ENV_PREFIX === "dev/" ? "prod/" : "dev/";
    const otherEnvKey = `${otherEnvPrefix}orders/1042/items/88/3f9a`;
    expect(() => assertPhotoKeyUnder(otherEnvKey, itemScope)).toThrow(
      "Invalid image path"
    );
  });
});
