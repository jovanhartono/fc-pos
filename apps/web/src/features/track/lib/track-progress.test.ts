import { describe, expect, it } from "bun:test";
import type { DerivedItemStatus } from "@fresclean/api/rules";
import type { TrackCharge } from "@/features/track/api";
import {
	STAGES,
	trackPayment,
	trackProgress,
} from "@/features/track/lib/track-progress";

const item = (status: DerivedItemStatus, services: string[] = []) => ({
	status,
	services: services.map((s) => ({ status: s })),
});

const charge = (overrides: Partial<TrackCharge> = {}): TrackCharge =>
	({
		amount: 150_000,
		expires_at: "2026-11-16T10:15:00.000Z",
		qr_content: "000201...",
		qr_image_url: null,
		redirect_url: null,
		...overrides,
	}) as TrackCharge;

describe("trackProgress", () => {
	it("puts a queued Item on Received", () => {
		expect(trackProgress([item("queued")]).stageIndex).toBe(0);
	});

	it("puts an Item being worked on on Cleaning", () => {
		expect(
			trackProgress([item("processing", ["processing", "waiting_qc"])])
				.stageIndex,
		).toBe(1);
	});

	it("puts an Item with only the check left on QC", () => {
		expect(
			trackProgress([item("processing", ["waiting_qc", "waiting_qc"])])
				.stageIndex,
		).toBe(2);
	});

	it("puts a ready Item on Ready", () => {
		expect(trackProgress([item("ready_for_pickup")]).stageIndex).toBe(3);
	});

	it("follows the slowest Item", () => {
		expect(
			trackProgress([
				item("ready_for_pickup"),
				item("processing", ["waiting_qc"]),
				item("queued"),
			]).stageIndex,
		).toBe(0);
	});

	it("keeps a refunded Item still on the rack on Ready, not done", () => {
		const progress = trackProgress([item("refunded")]);
		expect(progress.stageIndex).toBe(3);
		expect(progress.stageIndex).not.toBe(STAGES.length);
		expect(progress.readyCount).toBe(1);
		expect(progress.pendingCount).toBe(1);
	});

	it("reads as done once every Item is collected or cancelled", () => {
		expect(
			trackProgress([item("picked_up"), item("cancelled")]).stageIndex,
		).toBe(STAGES.length);
	});

	it("reads as done for an Order with no Items", () => {
		expect(trackProgress([])).toEqual({
			stageIndex: STAGES.length,
			readyCount: 0,
			pendingCount: 0,
		});
	});

	it("counts ready Items out of the ones still owed", () => {
		expect(
			trackProgress([
				item("ready_for_pickup"),
				item("refunded"),
				item("processing", ["processing"]),
				item("picked_up"),
				item("cancelled"),
			]),
		).toEqual({ stageIndex: 1, readyCount: 2, pendingCount: 3 });
	});
});

describe("trackPayment", () => {
	const unpaid = {
		payment_status: "unpaid" as const,
		net_due: 150_000,
		open_charge: null,
	};

	it("is none before this phone showed a QR", () => {
		expect(trackPayment(unpaid, null)).toBe("none");
	});

	it("is none while the QR is still up", () => {
		const shown = charge();
		expect(trackPayment({ ...unpaid, open_charge: shown }, shown)).toBe("none");
	});

	it("is paid-here once the Order is paid after this phone showed a QR", () => {
		expect(
			trackPayment({ ...unpaid, payment_status: "paid", net_due: 0 }, charge()),
		).toBe("paid-here");
	});

	it("is none for a paid Order this phone never showed a QR for", () => {
		expect(
			trackPayment({ ...unpaid, payment_status: "paid", net_due: 0 }, null),
		).toBe("none");
	});

	it("is expired when the QR is gone and the amount stayed the same", () => {
		expect(trackPayment(unpaid, charge())).toBe("expired");
	});

	it("is expired when only a page to open is left for the same amount", () => {
		expect(
			trackPayment(
				{
					...unpaid,
					open_charge: charge({ qr_content: null, redirect_url: "https://x" }),
				},
				charge(),
			),
		).toBe("expired");
	});

	it("is none when the QR is gone because the amount changed", () => {
		expect(trackPayment({ ...unpaid, net_due: 120_000 }, charge())).toBe(
			"none",
		);
	});
});
