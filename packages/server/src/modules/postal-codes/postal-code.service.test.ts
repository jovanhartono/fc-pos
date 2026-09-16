import { describe, expect, it, mock } from "bun:test";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";

const KNOWN = "16424";

mock.module("@/modules/postal-codes/postal-code.repository", () => ({
  findPostalCodeByCode: (code: string) =>
    Promise.resolve(
      code === KNOWN
        ? {
            city: "KOTA DEPOK",
            code: KNOWN,
            districts: "BEJI",
            province: "JAWA BARAT",
          }
        : undefined
    ),
  listPostalCodes: () => Promise.resolve([]),
}));

const { assertPostalCodeExists } = await import(
  "@/modules/postal-codes/postal-code.service"
);

describe("assertPostalCodeExists", () => {
  it("resolves for a code the reference table holds", async () => {
    expect(await assertPostalCodeExists(KNOWN)).toBeUndefined();
  });

  // The FK would refuse it anyway, but as a 500. A cashier mistyping the kode
  // pos off a shipping label deserves to be told which field is wrong.
  it("rejects a code that is not real", async () => {
    expect(
      await captureRejection(assertPostalCodeExists("00000"))
    ).toBeInstanceOf(BadRequestException);
  });
});
