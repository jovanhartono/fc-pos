import { describe, expect, it } from "bun:test";
import {
  generateCrockfordCode,
  mintCampaignCodes,
} from "@/modules/campaigns/campaign.repository";
import type { OrderTx } from "@/modules/orders/order.repository";

const CROCKFORD = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

describe("generateCrockfordCode", () => {
  it("returns an 8-character code", () => {
    expect(generateCrockfordCode()).toHaveLength(8);
  });

  it("only emits Crockford base32 characters (excludes 0/O/1/I/L)", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateCrockfordCode()).toMatch(CROCKFORD);
    }
  });

  it("has enough entropy to avoid collisions across a large sample", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      codes.add(generateCrockfordCode());
    }
    // 30^8 (~6.5e11) code space: 2000 draws colliding is astronomically
    // unlikely. A constant/low-entropy generator would collapse this far below.
    expect(codes.size).toBeGreaterThan(1990);
  });
});

// Per-attempt outcome for the fake insert: a number = how many of the requested
// rows ON CONFLICT DO NOTHING actually inserted (a shortfall models code
// collisions silently skipped), "boom" = a genuine non-conflict DB error.
type InsertBehavior = number | "boom";

// A fake OrderTx whose insert().values().onConflictDoNothing().returning()
// resolves to the inserted id rows per scripted attempt, recording how many
// rows each attempt requested.
function makeTx(behaviors: InsertBehavior[]) {
  const requested: number[] = [];
  let call = 0;
  const tx = {
    insert: () => ({
      values: (rows: unknown[]) => {
        const requestedCount = Array.isArray(rows) ? rows.length : 0;
        requested.push(requestedCount);
        const behavior = behaviors[call] ?? requestedCount;
        call += 1;
        return {
          onConflictDoNothing: () => ({
            returning: () => {
              if (behavior === "boom") {
                return Promise.reject({ code: "42P01" });
              }
              const insertedCount = Math.min(behavior, requestedCount);
              return Promise.resolve(
                Array.from({ length: insertedCount }, (_, index) => ({
                  id: index,
                }))
              );
            },
          }),
        };
      },
    }),
  };
  return { tx: tx as unknown as OrderTx, requested };
}

const captureRejection = async (
  promise: Promise<unknown>
): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject, but it resolved");
};

describe("mintCampaignCodes", () => {
  it("inserts the whole batch in one attempt on success", async () => {
    const { tx, requested } = makeTx([5]);
    await mintCampaignCodes(tx, 1, 5);
    expect(requested).toEqual([5]);
  });

  it("retries only the shortfall when codes collide, then succeeds", async () => {
    // Attempt 1 inserts 1 of 3 (2 collided); attempt 2 inserts the missing 2.
    const { tx, requested } = makeTx([1, 2]);
    await mintCampaignCodes(tx, 1, 3);
    expect(requested).toEqual([3, 2]);
  });

  it("gives up after exceeding the collision-retry ceiling", async () => {
    const { tx, requested } = makeTx(Array.from({ length: 20 }, () => 0));
    const error = await captureRejection(mintCampaignCodes(tx, 1, 2));
    expect((error as Error).message).toBe(
      "Too many code collisions during minting"
    );
    // 11 insert attempts (attempts 0..10) before the ceiling guard trips.
    expect(requested).toHaveLength(11);
  });

  it("propagates a non-collision database error without retrying", async () => {
    const { tx, requested } = makeTx(["boom"]);
    const error = await captureRejection(mintCampaignCodes(tx, 1, 4));
    expect((error as { code?: string }).code).toBe("42P01");
    expect(requested).toHaveLength(1);
  });
});
