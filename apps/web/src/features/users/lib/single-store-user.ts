interface StoreScopedUser {
	role: string;
	userStores: readonly unknown[];
}

// A cashier or worker tied to one Store has nothing to choose, so screens can
// drop the Store picker for them. Admins always choose.
export const isSingleStoreUser = (user: StoreScopedUser | undefined) =>
	!!user && user.role !== "admin" && user.userStores.length === 1;
