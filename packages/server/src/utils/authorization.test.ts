import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ForbiddenException } from "@/errors";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

// One question every list screen asks: which branches may this person see? The
// answer depends only on who is asking and whether they named a branch, so the
// fake database here is just the `user_stores` sheet — the branches this staff
// member is rostered at.
const roster = {
  storeIds: [] as number[],
};

const prepared = (execute: (params: Record<string, number>) => unknown) => ({
  prepare: () => ({
    execute: (params: Record<string, number>) => execute(params),
  }),
});

mock.module("@/db", () => ({
  db: {
    query: {
      userStoresTable: {
        findMany: () =>
          prepared(() =>
            Promise.resolve(roster.storeIds.map((store_id) => ({ store_id })))
          ),
        findFirst: () =>
          prepared((params) =>
            Promise.resolve(
              roster.storeIds.includes(params.store_id) ? { id: 1 } : undefined
            )
          ),
      },
      // assertOrderAccess builds its lookup at import time; nothing here reads it.
      ordersTable: {
        findFirst: () => prepared(() => Promise.resolve(undefined)),
      },
    },
  },
}));

const { resolveStoreScope } = await import("@/utils/authorization");

const staff = (id: number, role: JWTPayload["role"]): JWTPayload => ({
  can_process_pickup: false,
  id,
  name: "Staff",
  role,
  username: `staff-${id}`,
});

// Sari works the till at Kemang (store 1); Pak Rudi runs all six branches.
const CASHIER = staff(9, "cashier");
const ADMIN = staff(1, "admin");

const KEMANG = 1;
const BINTARO = 2;

beforeEach(() => {
  roster.storeIds = [KEMANG];
});

describe("resolveStoreScope", () => {
  it("hands an admin who named no branch the whole company", async () => {
    expect(await resolveStoreScope(ADMIN)).toEqual({ kind: "all" });
  });

  it("fences a cashier who named no branch to the branches they are rostered at", async () => {
    roster.storeIds = [KEMANG, BINTARO];

    expect(await resolveStoreScope(CASHIER)).toEqual({
      kind: "some",
      storeIds: [KEMANG, BINTARO],
    });
  });

  it("leaves a new hire not yet rostered anywhere with no branch at all", async () => {
    // An empty roster is not permission to see everything — it is a staff
    // account waiting to be assigned to a branch.
    roster.storeIds = [];

    expect(await resolveStoreScope(CASHIER)).toEqual({ kind: "none" });
  });

  it("lets a cashier open the branch they work at", async () => {
    expect(await resolveStoreScope(CASHIER, KEMANG)).toEqual({
      kind: "one",
      storeId: KEMANG,
    });
  });

  it("refuses a cashier the branch they do not work at", async () => {
    // Sari at Kemang must never reach a Bintaro order, however she asks.
    const error = await captureRejection(resolveStoreScope(CASHIER, BINTARO));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error).toHaveProperty(
      "message",
      "You do not have access to this store"
    );
  });

  it("lets an admin open a branch they are not rostered at", async () => {
    // Admins are on nobody's roster; naming a branch still narrows them to it.
    roster.storeIds = [];

    expect(await resolveStoreScope(ADMIN, BINTARO)).toEqual({
      kind: "one",
      storeId: BINTARO,
    });
  });
});
