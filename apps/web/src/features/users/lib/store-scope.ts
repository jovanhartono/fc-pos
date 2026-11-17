import type { Me } from "@/features/users/api";

export interface StoreScope {
	isAdmin: boolean;
	// Undefined for an admin, who may open every Store.
	allowedStoreIds: number[] | undefined;
}

export const storeScope = (me: Pick<Me, "role" | "userStores">): StoreScope => {
	if (me.role === "admin") {
		return { isAdmin: true, allowedStoreIds: undefined };
	}
	return {
		isAdmin: false,
		allowedStoreIds: me.userStores.map((item) => item.store_id),
	};
};

export const canOpenStore = (scope: StoreScope, storeId: number) =>
	scope.allowedStoreIds?.includes(storeId) ?? true;

interface PickStoreOptions {
	// From the URL, such as a link shared from another Store.
	requested?: number;
	// The Store this User last worked at on this screen; they may have been
	// moved off it since.
	remembered?: number;
	// Each screen decides what an admin lands on when nothing else applies.
	adminDefault?: number;
}

export const pickStore = (
	scope: StoreScope,
	{ requested, remembered, adminDefault }: PickStoreOptions = {},
): number | undefined => {
	if (requested !== undefined && canOpenStore(scope, requested)) {
		return requested;
	}
	if (remembered !== undefined && canOpenStore(scope, remembered)) {
		return remembered;
	}
	return scope.isAdmin ? adminDefault : scope.allowedStoreIds?.[0];
};
