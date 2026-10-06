import { describe, expect, it } from "bun:test";
import {
	findWorkshopRework,
	reworkChoiceCaption,
} from "@/features/orders/lib/refund-rework";

type Line = Parameters<typeof findWorkshopRework>[0];

const line = (status: string, reworkStatuses: string[]): Line =>
	({
		complaints: [
			{ reworkLines: reworkStatuses.map((s, i) => ({ id: i + 1, status: s })) },
		],
		status,
	}) as unknown as Line;

describe("findWorkshopRework", () => {
	it("names the round still in the workshop, after a finished one", () => {
		expect(
			findWorkshopRework(line("picked_up", ["picked_up", "processing"])),
		).toEqual({ round: 2, wentHome: true });
	});

	it("reads a pair turned down at the counter as never having left", () => {
		expect(findWorkshopRework(line("ready_for_pickup", ["queued"]))).toEqual({
			round: 1,
			wentHome: false,
		});
	});

	// A round already on the shelf goes home with the pair; nothing to choose.
	it("finds nothing when no round is in the workshop", () => {
		expect(findWorkshopRework(line("picked_up", ["ready_for_pickup"]))).toBe(
			undefined,
		);
		expect(findWorkshopRework(line("picked_up", []))).toBe(undefined);
	});
});

describe("reworkChoiceCaption", () => {
	it("says what each choice does to the round", () => {
		expect(reworkChoiceCaption({ round: 2, wentHome: true }, false)).toBe(
			"Rework 2 stops; the pair goes back as is.",
		);
		expect(reworkChoiceCaption({ round: 1, wentHome: false }, false)).toBe(
			"Rework 1 is cancelled.",
		);
		expect(reworkChoiceCaption({ round: 1, wentHome: false }, true)).toBe(
			"Rework 1 keeps going, free.",
		);
	});
});
