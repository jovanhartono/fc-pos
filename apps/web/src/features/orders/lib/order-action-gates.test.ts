import { describe, expect, it } from "bun:test";
import type { Me, OrderDetail } from "@/lib/api";
import { getOrderActionGates } from "./order-action-gates";

type ServiceOverrides = Record<string, unknown>;

const service = (over: ServiceOverrides = {}) => ({
	id: 1,
	status: "queued",
	reworkOf: null,
	complaints: [],
	...over,
});

const product = (over: Record<string, unknown> = {}) => ({
	id: 1,
	refunded_at: null,
	cancelled_at: null,
	...over,
});

const detail = (over: Record<string, unknown> = {}): OrderDetail =>
	({
		status: "processing",
		payment_status: "paid",
		services: [],
		products: [],
		...over,
	}) as unknown as OrderDetail;

const admin = { role: "admin" } as Me;
const cashier = { role: "cashier" } as Me;
const worker = { role: "worker", can_process_pickup: false } as Me;
const pickupWorker = { role: "worker", can_process_pickup: true } as Me;

describe("role gates", () => {
	it("grants money gates to admin and cashier only", () => {
		expect(getOrderActionGates(admin, detail()).isPaymentAllowed).toBe(true);
		expect(getOrderActionGates(cashier, detail()).isPaymentAllowed).toBe(true);
		expect(getOrderActionGates(worker, detail()).isPaymentAllowed).toBe(false);
	});

	it("grants pickup to payment roles and flagged workers", () => {
		expect(getOrderActionGates(cashier, detail()).isPickupAllowed).toBe(true);
		expect(getOrderActionGates(pickupWorker, detail()).isPickupAllowed).toBe(
			true,
		);
		expect(getOrderActionGates(worker, detail()).isPickupAllowed).toBe(false);
	});

	it("lets workers manage the drop-off photo", () => {
		expect(getOrderActionGates(worker, detail()).canManageDropoffPhoto).toBe(
			true,
		);
	});

	it("denies everything without a user", () => {
		const gates = getOrderActionGates(undefined, detail());
		expect(gates.isAdmin).toBe(false);
		expect(gates.isPaymentAllowed).toBe(false);
		expect(gates.isPickupAllowed).toBe(false);
	});
});

describe("refundable lines", () => {
	it("excludes refunded, cancelled, and rework service lines", () => {
		const gates = getOrderActionGates(
			admin,
			detail({
				services: [
					service({ id: 1, status: "picked_up" }),
					service({ id: 2, status: "refunded" }),
					service({ id: 3, status: "cancelled" }),
					service({ id: 4, status: "picked_up", reworkOf: { id: 9 } }),
				],
			}),
		);

		expect(gates.refundableServices.map((s) => s.id)).toEqual([1]);
	});

	it("excludes product lines that already took an off-ramp", () => {
		const gates = getOrderActionGates(
			admin,
			detail({
				products: [
					product({ id: 1 }),
					product({ id: 2, refunded_at: "2026-07-01" }),
					product({ id: 3, cancelled_at: "2026-07-01" }),
				],
			}),
		);

		expect(gates.refundableProducts.map((p) => p.id)).toEqual([1]);
	});
});

describe("cancellable lines", () => {
	it("excludes picked_up, refunded, and cancelled service lines", () => {
		const gates = getOrderActionGates(
			admin,
			detail({
				services: [
					service({ id: 1, status: "processing" }),
					service({ id: 2, status: "picked_up" }),
					service({ id: 3, status: "refunded" }),
					service({ id: 4, status: "cancelled" }),
				],
			}),
		);

		expect(gates.cancellableServices.map((s) => s.id)).toEqual([1]);
	});
});

describe("canOpenPickup (ADR-0009: payment precedes pickup)", () => {
	const readyPaid = detail({
		payment_status: "paid",
		services: [service({ status: "ready_for_pickup" })],
	});
	const readyUnpaid = detail({
		payment_status: "unpaid",
		services: [service({ status: "ready_for_pickup" })],
	});

	it("opens for a paid order with ready items", () => {
		expect(getOrderActionGates(cashier, readyPaid).canOpenPickup).toBe(true);
	});

	it("blocks an unpaid order and explains why per role", () => {
		const cashierGates = getOrderActionGates(cashier, readyUnpaid);
		expect(cashierGates.canOpenPickup).toBe(false);
		expect(cashierGates.pickupDisabledReason).toBe(
			"Order must be paid before pickup.",
		);

		const workerGates = getOrderActionGates(pickupWorker, readyUnpaid);
		expect(workerGates.pickupDisabledReason).toBe(
			"A cashier must collect payment before pickup.",
		);
	});

	it("stays closed with nothing ready", () => {
		const gates = getOrderActionGates(
			cashier,
			detail({ services: [service({ status: "processing" })] }),
		);
		expect(gates.canOpenPickup).toBe(false);
		expect(gates.pickupDisabledReason).toBe(undefined);
	});
});

describe("order off-ramps (ADR-0008: disjoint by payment_status)", () => {
	it("allows cancel only while unpaid", () => {
		const unpaid = detail({
			payment_status: "unpaid",
			services: [service()],
		});
		expect(getOrderActionGates(worker, unpaid).canCancelOrder).toBe(true);

		const paid = detail({ payment_status: "paid", services: [service()] });
		expect(getOrderActionGates(worker, paid).canCancelOrder).toBe(false);
	});

	it("never cancels a cancelled order", () => {
		const gates = getOrderActionGates(
			worker,
			detail({
				status: "cancelled",
				payment_status: "unpaid",
				services: [service()],
			}),
		);
		expect(gates.canCancelOrder).toBe(false);
	});

	it("allows refund only for admins on paid orders with refundable lines", () => {
		const paid = detail({ payment_status: "paid", services: [service()] });
		expect(getOrderActionGates(admin, paid).canRefundWholeOrder).toBe(true);
		expect(getOrderActionGates(cashier, paid).canRefundWholeOrder).toBe(false);

		const unpaid = detail({
			payment_status: "unpaid",
			services: [service()],
		});
		expect(getOrderActionGates(admin, unpaid).canRefundWholeOrder).toBe(false);
	});
});

describe("complaintable lines (ADR-0013)", () => {
	it("offers only picked_up lines with no complaint that are not reworks", () => {
		const gates = getOrderActionGates(
			worker,
			detail({
				services: [
					service({ id: 1, status: "picked_up" }),
					service({ id: 2, status: "picked_up", complaints: [{ id: 7 }] }),
					service({ id: 3, status: "picked_up", reworkOf: { id: 1 } }),
					service({ id: 4, status: "ready_for_pickup" }),
				],
			}),
		);

		expect(gates.complaintableServices.map((s) => s.id)).toEqual([1]);
		expect(gates.canOpenComplaint).toBe(true);
	});
});
