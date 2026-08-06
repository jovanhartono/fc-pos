import { describe, expect, test } from "bun:test";
import { toSearchParams } from "./api";

describe("toSearchParams", () => {
	test("a cleared search box drops the param instead of sending an empty one", () => {
		expect(toSearchParams({ limit: 20, search: "" })).toEqual({ limit: "20" });
	});

	test("page one still asks for offset=0", () => {
		expect(toSearchParams({ limit: 20, offset: 0 })).toEqual({
			limit: "20",
			offset: "0",
		});
	});

	test("an unset filter is absent, not empty", () => {
		expect(toSearchParams({ store_id: undefined, search: "nike" })).toEqual({
			search: "nike",
		});
	});

	test("filtering for deactivated staff sends is_active=false", () => {
		expect(toSearchParams({ is_active: false })).toEqual({
			is_active: "false",
		});
	});
});
