import { describe, expect, it, mock } from "bun:test";
import { ForbiddenException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import type { AuthUser } from "@/types";

// Which Stores may this person see? The answer depends only on who asks, the
// Stores they are rostered at, and whether they named a Store.
mock.module("@/db", () => ({
  db: {
    query: {
      // assertOrderAccess builds its lookup at import time; nothing here reads it.
      ordersTable: {
        findFirst: () => ({
          prepare: () => ({ execute: () => Promise.resolve(undefined) }),
        }),
      },
    },
  },
}));

const { resolveStoreScope } = await import("@/utils/authorization");

const KEMANG = 1;
const BINTARO = 2;

const staff = (
  id: number,
  role: AuthUser["role"],
  store_ids: number[]
): AuthUser => ({
  can_process_pickup: false,
  id,
  name: "Staff",
  role,
  store_ids,
  username: `staff-${id}`,
});

// Sari works the counter at Kemang (store 1); Pak Rudi runs all six Stores.
const CASHIER = staff(9, "cashier", [KEMANG]);
const ADMIN = staff(1, "admin", []);

describe("resolveStoreScope", () => {
  it("hands an admin who named no Store the whole company", async () => {
    expect(await resolveStoreScope(ADMIN)).toEqual({ kind: "all" });
  });

  it("fences a cashier who named no Store to the Stores they are rostered at", async () => {
    const cashier = staff(9, "cashier", [KEMANG, BINTARO]);

    expect(await resolveStoreScope(cashier)).toEqual({
      kind: "some",
      storeIds: [KEMANG, BINTARO],
    });
  });

  it("leaves a new hire not yet rostered anywhere with no Store at all", async () => {
    // An empty roster is not permission to see everything — it is a staff
    // account waiting to be assigned to a Store.
    const newHire = staff(9, "cashier", []);

    expect(await resolveStoreScope(newHire)).toEqual({ kind: "none" });
  });

  it("lets a cashier open the Store they work at", async () => {
    expect(await resolveStoreScope(CASHIER, KEMANG)).toEqual({
      kind: "one",
      storeId: KEMANG,
    });
  });

  it("refuses a cashier the Store they do not work at", async () => {
    // Sari at Kemang must never reach a Bintaro order, however she asks.
    const error = await captureRejection(resolveStoreScope(CASHIER, BINTARO));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error).toHaveProperty(
      "message",
      "You do not have access to this store"
    );
  });

  it("lets an admin open a Store they are not rostered at", async () => {
    // Admins are on nobody's roster; naming a Store still narrows them to it.
    expect(await resolveStoreScope(ADMIN, BINTARO)).toEqual({
      kind: "one",
      storeId: BINTARO,
    });
  });
});
