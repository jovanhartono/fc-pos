import { describe, expect, it } from "bun:test";
import {
	canOpenStore,
	pickStore,
	type StoreScope,
	storeScope,
} from "@/features/users/lib/store-scope";

const userAt = (...storeIds: number[]) =>
	storeScope({
		role: "worker",
		userStores: storeIds.map((store_id) => ({ store_id })),
	});
const admin = storeScope({ role: "admin", userStores: [{ store_id: 3 }] });

describe("storeScope", () => {
	const cases: [string, StoreScope, StoreScope][] = [
		["admin", admin, { isAdmin: true, allowedStoreIds: undefined }],
		[
			"worker with two Stores",
			userAt(2, 5),
			{ isAdmin: false, allowedStoreIds: [2, 5] },
		],
		[
			"worker with no Store assigned",
			userAt(),
			{ isAdmin: false, allowedStoreIds: [] },
		],
	];
	for (const [name, scope, expected] of cases) {
		it(name, () => {
			expect(scope).toEqual(expected);
		});
	}

	it("lets an admin open any Store, a worker only their own", () => {
		expect(canOpenStore(admin, 9)).toBe(true);
		expect(canOpenStore(userAt(2, 5), 5)).toBe(true);
		expect(canOpenStore(userAt(2, 5), 9)).toBe(false);
	});
});

describe("pickStore", () => {
	const cases: [
		string,
		StoreScope,
		Parameters<typeof pickStore>[1],
		number | undefined,
	][] = [
		["worker moved off the remembered Store", userAt(4), { remembered: 2 }, 4],
		[
			"worker still at the remembered Store",
			userAt(2, 4),
			{ remembered: 4 },
			4,
		],
		[
			"admin with no Store picked, no default (Queue, Orders, POS)",
			admin,
			{},
			undefined,
		],
		[
			"admin with no Store picked, first Store default (Counter)",
			admin,
			{ adminDefault: 1 },
			1,
		],
		["admin keeps a remembered Store", admin, { remembered: 7 }, 7],
		[
			"worker with no Store assigned",
			userAt(),
			{ remembered: 2, adminDefault: 1 },
			undefined,
		],
		["link shared from another Store", userAt(2), { requested: 9 }, 2],
		["link to the worker's own Store", userAt(2, 5), { requested: 5 }, 5],
		[
			"link beats the remembered Store",
			userAt(2, 5),
			{ requested: 5, remembered: 2 },
			5,
		],
		[
			"User with two Stores and nothing picked lands on the first",
			userAt(2, 5),
			{},
			2,
		],
	];
	for (const [name, scope, options, expected] of cases) {
		it(name, () => {
			expect(pickStore(scope, options)).toBe(expected);
		});
	}
});
