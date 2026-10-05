import { describe, expect, test } from "bun:test";
import { isSingleStoreUser } from "./single-store-user";

const store = (store_id: number) => ({ store_id });

describe("isSingleStoreUser", () => {
	test("true for a non-admin with exactly one Store", () => {
		expect(isSingleStoreUser({ role: "cashier", userStores: [store(1)] })).toBe(
			true,
		);
		expect(isSingleStoreUser({ role: "worker", userStores: [store(1)] })).toBe(
			true,
		);
	});

	test("false for a non-admin with no Store or several", () => {
		expect(isSingleStoreUser({ role: "cashier", userStores: [] })).toBe(false);
		expect(
			isSingleStoreUser({ role: "cashier", userStores: [store(1), store(2)] }),
		).toBe(false);
	});

	test("false for an admin, whatever their Store list", () => {
		expect(isSingleStoreUser({ role: "admin", userStores: [store(1)] })).toBe(
			false,
		);
		expect(isSingleStoreUser({ role: "admin", userStores: [] })).toBe(false);
	});

	test("false while the current User is not loaded", () => {
		expect(isSingleStoreUser(undefined)).toBe(false);
	});
});
