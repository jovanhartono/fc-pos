import { describe, expect, it } from "bun:test";
import { groupReworksUnderOriginals } from "@/features/orders/lib/rework-nesting";

interface Line {
	id: number;
	reworkOf: number | null;
}

const group = (lines: Line[]) =>
	groupReworksUnderOriginals(lines, (line) => line.reworkOf).map(
		({ original, originalId, reworks }) => ({
			original: original?.id,
			originalId,
			reworks: reworks.map((line) => line.id),
		}),
	);

describe("groupReworksUnderOriginals", () => {
	it("puts every round under the treatment it redoes, in order", () => {
		expect(
			group([
				{ id: 1, reworkOf: null },
				{ id: 2, reworkOf: null },
				{ id: 3, reworkOf: 1 },
				{ id: 4, reworkOf: 1 },
			]),
		).toEqual([
			{ original: 1, originalId: 1, reworks: [3, 4] },
			{ original: 2, originalId: 2, reworks: [] },
		]);
	});

	// The queue after the pair went home: the original is off the rack.
	it("keeps a rework whose original is not listed, under that original's id", () => {
		expect(
			group([
				{ id: 2, reworkOf: null },
				{ id: 5, reworkOf: 1 },
			]),
		).toEqual([
			{ original: 2, originalId: 2, reworks: [] },
			{ original: undefined, originalId: 1, reworks: [5] },
		]);
	});
});
