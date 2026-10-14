import { describe, expect, it } from "bun:test";
import { groupBySlip, splitMethodName } from "./day-close";

const method = (name: string, payments: number, amount: number) => ({
	name,
	payments,
	amount,
	payment_method_id: 1,
});

describe("splitMethodName", () => {
	it("takes the text after the last separator as the slip", () => {
		expect(splitMethodName("QRIS - EDC BCA")).toEqual({
			slip: "EDC BCA",
			line: "QRIS",
		});
		expect(splitMethodName("Debit - Visa - EDC BCA")).toEqual({
			slip: "EDC BCA",
			line: "Debit - Visa",
		});
	});

	it("keeps a name without the separator as its own slip", () => {
		expect(splitMethodName("Cash")).toEqual({ slip: "Cash", line: "Cash" });
	});
});

describe("groupBySlip", () => {
	it("sums lines under one slip, in the order the server sent them", () => {
		const groups = groupBySlip([
			method("Cash", 3, 300),
			method("QRIS - EDC BCA", 2, 200),
			method("Debit - EDC BCA", 1, 50),
		]);
		expect(groups.map((group) => group.slip)).toEqual(["Cash", "EDC BCA"]);
		expect(groups[1].payments).toBe(3);
		expect(groups[1].amount).toBe(250);
		expect(groups[1].lines.map((line) => line.line)).toEqual(["QRIS", "Debit"]);
		expect(groups[1].isSingle).toBe(false);
	});

	it("shows a lone line named like its slip as one row", () => {
		const [group] = groupBySlip([method("Cash", 1, 10)]);
		expect(group.isSingle).toBe(true);
	});

	it("keeps a lone line under a different slip name as a group", () => {
		const [group] = groupBySlip([method("QRIS - EDC BCA", 1, 10)]);
		expect(group.isSingle).toBe(false);
	});
});
