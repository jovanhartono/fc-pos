import type { JWTPayload } from "@/types";
import type { StoreScope } from "@/utils/authorization";

interface StoreMembershipState {
  assertCalls?: { storeId: number; userId: number }[];
  listCalls?: number[];
  storeIds: number[];
}

// Set `storeIds` to stand up "a cashier at two Stores" or "a new hire at none".
// Mirrors utils/authorization.ts; keep the two in step.
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
    // Throws like the real one: falling through would run the query for every
    // Store's takings. Bun refuses to link a double missing any named export.
    unhandledStoreScope: (scope: never): never => {
      throw new Error(`Unhandled store scope: ${JSON.stringify(scope)}`);
    },
  };
};
