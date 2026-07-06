import { describe, expect, it } from "bun:test";
import {
  CampaignPayloadSchema,
  CampaignUpdatePayloadSchema,
} from "@/modules/campaigns/campaign.schema";

// Minimal valid fixed-discount campaign. redemption_mode defaults to "listed"
// so the base fixture is a listed campaign that mints no codes.
const baseCreate = {
  code: "SAVE10",
  name: "Save 10k",
  discount_type: "fixed" as const,
  discount_value: "10000",
};

const issueFor = (
  result: ReturnType<typeof CampaignPayloadSchema.safeParse>,
  key: string
) =>
  result.success
    ? undefined
    : result.error.issues.find((i) => i.path[0] === key);

describe("CampaignPayloadSchema — redemption-mode exclusivity", () => {
  it("defaults redemption_mode to listed and needs no code_count", () => {
    const result = CampaignPayloadSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.redemption_mode).toBe("listed");
    }
  });

  it("accepts a listed campaign with a usage_limit cap", () => {
    expect(
      CampaignPayloadSchema.safeParse({ ...baseCreate, usage_limit: 100 })
        .success
    ).toBe(true);
  });

  it("rejects a listed campaign that carries code_count", () => {
    const result = CampaignPayloadSchema.safeParse({
      ...baseCreate,
      code_count: 5,
    });
    expect(result.success).toBe(false);
    expect(issueFor(result, "code_count")?.message).toBe(
      "code_count is only allowed for voucher campaigns"
    );
  });

  it("accepts a voucher campaign with code_count and no usage_limit", () => {
    expect(
      CampaignPayloadSchema.safeParse({
        ...baseCreate,
        redemption_mode: "code",
        code_count: 10,
      }).success
    ).toBe(true);
  });

  it("rejects a voucher campaign missing code_count", () => {
    const result = CampaignPayloadSchema.safeParse({
      ...baseCreate,
      redemption_mode: "code",
    });
    expect(result.success).toBe(false);
    expect(issueFor(result, "code_count")?.message).toBe(
      "code_count is required (min 1) for voucher campaigns"
    );
  });

  it("rejects a voucher campaign that also sets usage_limit", () => {
    const result = CampaignPayloadSchema.safeParse({
      ...baseCreate,
      redemption_mode: "code",
      code_count: 10,
      usage_limit: 50,
    });
    expect(result.success).toBe(false);
    expect(issueFor(result, "usage_limit")?.message).toBe(
      "usage_limit is not allowed for voucher campaigns"
    );
  });
});

describe("CampaignUpdatePayloadSchema — immutable redemption fields", () => {
  it("allows editing usage_limit on an existing campaign", () => {
    expect(
      CampaignUpdatePayloadSchema.safeParse({ usage_limit: 25 }).success
    ).toBe(true);
  });

  it("allows clearing usage_limit with null", () => {
    expect(
      CampaignUpdatePayloadSchema.safeParse({ usage_limit: null }).success
    ).toBe(true);
  });

  it("rejects redemption_mode — mode is fixed at create", () => {
    // .strict() surfaces the immutable field as an unrecognized key.
    expect(
      CampaignUpdatePayloadSchema.safeParse({ redemption_mode: "code" }).success
    ).toBe(false);
  });

  it("rejects code_count — the minted batch is fixed at create", () => {
    expect(
      CampaignUpdatePayloadSchema.safeParse({ code_count: 5 }).success
    ).toBe(false);
  });
});
