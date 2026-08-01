import { describe, expect, it } from "bun:test";
import {
  campaignCodesTable,
  campaignsTable,
  orderCampaignsTable,
} from "@/db/schema";
import {
  type CampaignRedemptionFields,
  claimRedemptions,
  type ResolvedCampaignRow,
  releaseRedemptions,
} from "@/modules/campaigns/campaign-redemption.service";
import type { OrderTx } from "@/modules/orders/order.repository";
import { captureRejection } from "@/test-support/capture-rejection";

interface UpdateCall {
  set: Record<string, unknown>;
  table: unknown;
}

interface InsertCall {
  rows: Record<string, unknown>[];
  table: unknown;
}

// A fake OrderTx that scripts each update(...).set().where().returning() to
// resolve with the next entry of updateResults (in call order), records every
// update/insert, and serves orderCampaigns rows to query...findMany().
function makeTx({
  updateResults = [],
  orderCampaigns = [],
}: {
  updateResults?: { id: number }[][];
  orderCampaigns?: {
    id: number;
    campaign_id: number;
    code_id: number | null;
  }[];
} = {}) {
  const updates: UpdateCall[] = [];
  const inserts: InsertCall[] = [];
  let updateCall = 0;

  const tx = {
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => {
        updates.push({ table, set });
        return {
          where: () => ({
            returning: () => {
              const result = updateResults[updateCall] ?? [];
              updateCall += 1;
              return Promise.resolve(result);
            },
          }),
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (rows: Record<string, unknown>[]) => {
        inserts.push({ table, rows });
        return Promise.resolve();
      },
    }),
    query: {
      orderCampaignsTable: {
        findMany: () => Promise.resolve(orderCampaigns),
      },
    },
  };

  return { tx: tx as unknown as OrderTx, updates, inserts };
}

const redemptionFields: CampaignRedemptionFields = {
  applied_amount: "10000",
  buy_quantity: null,
  campaign_id: 1,
  discount_type: "fixed",
  discount_value: "10000",
  free_quantity: null,
  max_discount: null,
};

const listedRow = (): ResolvedCampaignRow => ({
  ...redemptionFields,
  kind: "listed",
});

const voucherRow = (code: string): ResolvedCampaignRow => ({
  ...redemptionFields,
  kind: "voucher",
  voucherCode: code,
});

describe("claimRedemptions", () => {
  it("does nothing for an order without campaigns", async () => {
    const { tx, updates, inserts } = makeTx();
    await claimRedemptions(tx, [], 7);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("claims a listed campaign via the conditional increment and logs it", async () => {
    const { tx, updates, inserts } = makeTx({ updateResults: [[{ id: 1 }]] });
    await claimRedemptions(tx, [listedRow()], 7);

    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe(campaignsTable);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe(orderCampaignsTable);
    expect(inserts[0].rows).toEqual([
      {
        order_id: 7,
        campaign_id: 1,
        code_id: null,
        discount_type: "fixed",
        discount_value: "10000",
        max_discount: null,
        applied_amount: "10000",
        buy_quantity: null,
        free_quantity: null,
      },
    ]);
  });

  it("claims a voucher's single-use code and logs its code_id", async () => {
    const { tx, updates, inserts } = makeTx({ updateResults: [[{ id: 42 }]] });
    await claimRedemptions(tx, [voucherRow("ABCD2345")], 7);

    expect(updates[0].table).toBe(campaignCodesTable);
    expect(inserts[0].rows[0].code_id).toBe(42);
  });

  it("rejects when a capped campaign is exhausted, before logging anything", async () => {
    const { tx, inserts } = makeTx({ updateResults: [[]] });
    const error = await captureRejection(
      claimRedemptions(tx, [listedRow()], 7)
    );
    expect((error as Error).message).toBe(
      "Campaign 1 has reached its usage limit"
    );
    expect(inserts).toHaveLength(0);
  });

  it("rejects when a voucher code was already redeemed, before logging anything", async () => {
    const { tx, inserts } = makeTx({ updateResults: [[]] });
    const error = await captureRejection(
      claimRedemptions(tx, [voucherRow("ABCD2345")], 7)
    );
    expect((error as Error).message).toBe(
      "Voucher code ABCD2345 has already been redeemed"
    );
    expect(inserts).toHaveLength(0);
  });
});

describe("releaseRedemptions", () => {
  it("unclaims a code redemption and decrements a listed one", async () => {
    const { tx, updates } = makeTx({
      orderCampaigns: [
        { id: 1, campaign_id: 3, code_id: 42 },
        { id: 2, campaign_id: 4, code_id: null },
      ],
    });
    await releaseRedemptions(tx, 7);

    expect(updates).toHaveLength(2);
    expect(updates[0].table).toBe(campaignCodesTable);
    expect(updates[0].set).toEqual({
      redeemed_at: null,
      redeemed_order_id: null,
    });
    expect(updates[1].table).toBe(campaignsTable);
    expect(Object.keys(updates[1].set)).toEqual(["redeemed_count"]);
  });

  it("does nothing for an order without logged redemptions", async () => {
    const { tx, updates } = makeTx();
    await releaseRedemptions(tx, 7);
    expect(updates).toHaveLength(0);
  });
});
