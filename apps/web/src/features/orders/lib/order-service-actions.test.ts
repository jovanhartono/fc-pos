import { describe, expect, it } from "bun:test";
import { orderServiceActions } from "@/features/orders/lib/order-service-actions";

type Line = Parameters<typeof orderServiceActions>[0];

const ME = 7;
const OTHER = 9;

const line = (over: Record<string, unknown> = {}): Line =>
	({
		status: "queued",
		handler_id: null,
		handler: null,
		has_start_photo: true,
		reworkOf: null,
		...over,
	}) as unknown as Line;

describe("orderServiceActions", () => {
	// Terminal statuses have their own endpoints, so they are never offered.
	const table: [string, boolean, string[]][] = [
		["queued", true, []],
		["processing", false, ["waiting_qc"]],
		["waiting_qc", false, ["qc_reject", "ready_for_pickup"]],
		["qc_reject", false, ["processing"]],
		["ready_for_pickup", false, []],
		["picked_up", false, []],
		["refunded", false, []],
		["cancelled", false, []],
	];
	for (const [status, canStart, moves] of table) {
		it(`${status}: ${canStart ? "start" : "no start"}, moves [${moves.join(", ")}]`, () => {
			for (const worker of [ME, undefined]) {
				const actions = orderServiceActions(line({ status }), worker);
				expect(actions.start !== null).toBe(canStart);
				expect(actions.moves).toEqual(moves);
			}
		});
	}

	it("lets the Handler start their own Item on the Queue", () => {
		const actions = orderServiceActions(line({ handler_id: ME }), ME);
		expect(actions.start).toEqual({ blocker: undefined });
		expect(actions.isHeldByMe).toBe(true);
		expect(actions.isHeldByOther).toBe(false);
	});

	it("blocks a Queue worker starting an Item another worker holds", () => {
		const actions = orderServiceActions(
			line({ handler_id: OTHER, handler: { name: "Budi" } }),
			ME,
		);
		expect(actions.start).toEqual({
			blocker: "Budi is handling this item — actions are locked for you.",
		});
		expect(actions.isHeldByOther).toBe(true);
	});

	it("names no one when the other Handler's name is missing", () => {
		const actions = orderServiceActions(line({ handler_id: OTHER }), ME);
		expect(actions.start?.blocker).toBe(
			"Another worker is handling this item — actions are locked for you.",
		);
	});

	it("lets the Order sheet start an Item a worker holds", () => {
		const actions = orderServiceActions(
			line({ handler_id: OTHER, handler: { name: "Budi" } }),
		);
		expect(actions.start).toEqual({ blocker: undefined });
		expect(actions.isHeldByMe).toBe(false);
		expect(actions.isHeldByOther).toBe(false);
	});

	it("blocks starting without a start photo on both screens", () => {
		for (const worker of [ME, undefined]) {
			const actions = orderServiceActions(
				line({ has_start_photo: false }),
				worker,
			);
			expect(actions.start?.blocker).toBe(
				"Add an item photo before starting work.",
			);
			expect(actions.photoBlocker).toBe(
				"Add an item photo before starting work.",
			);
		}
	});

	it("asks a Rework for a fresh photo", () => {
		const actions = orderServiceActions(
			line({ has_start_photo: false, reworkOf: { id: 1 } }),
		);
		expect(actions.start?.blocker).toBe(
			"Take a new photo of the item before starting this rework.",
		);
	});

	it("names the other Handler before the missing photo on the Queue", () => {
		const actions = orderServiceActions(
			line({
				handler_id: OTHER,
				handler: { name: "Budi" },
				has_start_photo: false,
			}),
			ME,
		);
		expect(actions.start?.blocker).toBe(
			"Budi is handling this item — actions are locked for you.",
		);
		expect(actions.photoBlocker).toBe(
			"Add an item photo before starting work.",
		);
	});

	it("reads an unassigned line as held by nobody on the Queue", () => {
		const actions = orderServiceActions(line(), ME);
		expect(actions.isHeldByMe).toBe(false);
		expect(actions.isHeldByOther).toBe(false);
		expect(actions.start).toEqual({ blocker: undefined });
	});

	it("needs no photo once work has started", () => {
		const actions = orderServiceActions(
			line({ status: "processing", has_start_photo: false }),
		);
		expect(actions.photoBlocker).toBe(undefined);
	});
});
