import type { JWTPayload } from "@/types";
import type { StoreScope } from "@/utils/authorization";

interface StoreMembershipState {
  assertCalls?: { storeId: number; userId: number }[];
  listCalls?: number[];
  storeIds: number[];
}

// The store-scope gate as a service suite sees it: fake branch memberships, so a
// suite can stand up "a cashier who works at two branches" or "a new hire with
// none" by setting `storeIds`. Mirrors the decision table in
// utils/authorization.ts, which is pinned for real in utils/authorization.test.ts
// — keep the two in step.
export const authorizationDouble = (state: StoreMembershipState) => {
  const assertStoreAccess = (user: JWTPayload, storeId: number) => {
    state.assertCalls?.push({ storeId, userId: user.id });
    return Promise.resolve();
  };

  const getUserStoreIds = (userId: number) => {
    state.listCalls?.push(userId);
    return Promise.resolve(state.storeIds);
  };

  const resolveStoreScope = async (
    user: JWTPayload,
    storeId?: number
  ): Promise<StoreScope> => {
    if (storeId !== undefined) {
      await assertStoreAccess(user, storeId);
      return { kind: "one", storeId };
    }

    if (user.role === "admin") {
      return { kind: "all" };
    }

    const storeIds = await getUserStoreIds(user.id);

    return storeIds.length === 0
      ? { kind: "none" }
      : { kind: "some", storeIds };
  };

  return {
    assertOrderAccess: () => Promise.resolve({ id: 0, store_id: 0 }),
    assertStoreAccess,
    getUserStoreIds,
    resolveStoreScope,
    // Doubled with real teeth, not a no-op: a suite that reaches this has
    // routed a scope no screen handles, and letting it fall through would run
    // the query unfiltered — every branch's takings. Present here because a
    // module double must offer every export its importer names, or Bun refuses
    // to link the module at all.
    unhandledStoreScope: (scope: never): never => {
      throw new Error(`Unhandled store scope: ${JSON.stringify(scope)}`);
    },
  };
};
