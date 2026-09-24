import { describe, expect, it } from "bun:test";
import { getComplaintOutcome } from "./format";

describe("getComplaintOutcome", () => {
	it("reads Cancelled when the cashier cancelled the turned-down line", () => {
		expect(
			getComplaintOutcome({ subjectStatus: "cancelled", reworkCount: 0 }).label,
		).toBe("Cancelled");
	});

	it("keeps Refunded ahead of any rework", () => {
		expect(
			getComplaintOutcome({ subjectStatus: "refunded", reworkCount: 1 }).label,
		).toBe("Refunded");
	});

	it("reads Reworked once a round is on the rack, at the counter or after pickup", () => {
		expect(
			getComplaintOutcome({ subjectStatus: "ready_for_pickup", reworkCount: 1 })
				.label,
		).toBe("Reworked");
		expect(
			getComplaintOutcome({ subjectStatus: "picked_up", reworkCount: 2 }).label,
		).toBe("Reworked");
	});

	it("stays Pending while nothing has been decided", () => {
		expect(
			getComplaintOutcome({ subjectStatus: "ready_for_pickup", reworkCount: 0 })
				.label,
		).toBe("Pending");
	});
});
