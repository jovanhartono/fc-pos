import { HourglassLow, Package, Sparkle, Tote } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OrderDetail } from "@/lib/api";
import {
	formatOrderPickupState,
	getOrderPickupStateBadgeVariant,
} from "@/lib/status";

type OrderFulfillmentOverviewProps = {
	canCompletePickup: boolean;
	isCompleting: boolean;
	onCompletePickup: () => Promise<void>;
	order: OrderDetail;
};

const IN_FLIGHT_STATUSES = new Set(["queued", "processing", "quality_check"]);

export function OrderFulfillmentOverview({
	canCompletePickup,
	isCompleting,
	onCompletePickup,
	order,
}: OrderFulfillmentOverviewProps) {
	const fulfillment = order.fulfillment;
	const readyServices = order.services.filter(
		(service) => service.status === "ready_for_pickup",
	);
	const inFlightServices = order.services.filter((service) =>
		IN_FLIGHT_STATUSES.has(service.status),
	);
	const pickedUpServices = order.services.filter(
		(service) => service.status === "picked_up",
	);
	const progressWidth =
		fulfillment.service_total_count === 0
			? 0
			: (fulfillment.picked_up_count / fulfillment.service_total_count) * 100;

	return (
		<Card className="border-0 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(240,249,255,0.96)_50%,rgba(255,247,237,0.92))] ring-1 ring-slate-900/8">
			<CardContent className="grid gap-5 pt-4">
				<div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
					<div className="grid gap-3">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant={getOrderPickupStateBadgeVariant(fulfillment)}>
								{formatOrderPickupState(fulfillment)}
							</Badge>
							<Badge variant="outline">
								{`${fulfillment.service_total_count} service lines`}
							</Badge>
						</div>
						<div className="grid gap-2">
							<p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-500">
								Pickup Command Board
							</p>
							<h2 className="font-mono text-2xl text-slate-950">
								See what is ready now, what left the store, and what still needs
								work.
							</h2>
							<p className="max-w-3xl text-sm text-slate-600">
								Mixed-duration orders stay readable here. Express items can move
								to pickup while longer repairs remain active without forcing the
								full order closed too early.
							</p>
						</div>
						<div className="overflow-hidden border border-slate-900/10 bg-white">
							<div className="h-3 bg-slate-200">
								<div
									className="h-full bg-[linear-gradient(90deg,#f59e0b,#0f766e)] transition-[width] duration-300"
									style={{ width: `${progressWidth}%` }}
								/>
							</div>
							<div className="grid gap-3 px-4 py-3 md:grid-cols-4">
								<StatBlock
									icon={<Sparkle className="size-4" weight="duotone" />}
									label="Ready For Pickup"
									value={fulfillment.ready_for_pickup_count}
								/>
								<StatBlock
									icon={<Tote className="size-4" weight="duotone" />}
									label="Picked Up"
									value={fulfillment.picked_up_count}
								/>
								<StatBlock
									icon={<HourglassLow className="size-4" weight="duotone" />}
									label="Still In Service"
									value={fulfillment.remaining_count}
								/>
								<StatBlock
									icon={<Package className="size-4" weight="duotone" />}
									label="Active Lines"
									value={fulfillment.active_count}
								/>
							</div>
						</div>
					</div>

					<div className="grid gap-3 border border-slate-900/10 bg-white p-4">
						<p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
							Counter Desk
						</p>
						<p className="text-sm text-slate-600">
							Use the order-level completion action only when every remaining
							active line is already marked ready for pickup.
						</p>
						<Button
							type="button"
							className="h-11 bg-slate-950 text-white hover:bg-slate-800"
							loading={isCompleting}
							loadingText="Completing…"
							disabled={!canCompletePickup}
							onClick={onCompletePickup}
						>
							{fulfillment.is_partially_picked_up
								? "Complete remaining pickup"
								: "Mark order completed"}
						</Button>
						<p className="text-xs text-slate-500">
							{canCompletePickup
								? "This will mark all remaining ready lines as picked up."
								: "The button unlocks when no active line is still queued, processing, or in quality check."}
						</p>
					</div>
				</div>

				<div className="grid gap-4 xl:grid-cols-3">
					<LaneCard
						eyebrow="Ready Now"
						title="Pickup rail"
						description="Items already finished and waiting at the counter."
						emptyLabel="Nothing is staged for pickup yet."
						items={readyServices}
						tone="ready"
					/>
					<LaneCard
						eyebrow="Still Active"
						title="Service floor"
						description="Items still moving through queue, work, or quality check."
						emptyLabel="No active work remains."
						items={inFlightServices}
						tone="active"
					/>
					<LaneCard
						eyebrow="Released"
						title="Already collected"
						description="Items the customer has already taken home."
						emptyLabel="Nothing has been picked up from this order yet."
						items={pickedUpServices}
						tone="picked"
					/>
				</div>
			</CardContent>
		</Card>
	);
}

function StatBlock({
	icon,
	label,
	value,
}: {
	icon: ReactNode;
	label: string;
	value: number;
}) {
	return (
		<div className="grid gap-1">
			<div className="flex items-center gap-2 text-slate-500">
				{icon}
				<p className="text-[10px] font-semibold uppercase tracking-[0.26em]">
					{label}
				</p>
			</div>
			<p className="font-mono text-2xl text-slate-950">{value}</p>
		</div>
	);
}

function LaneCard({
	description,
	emptyLabel,
	eyebrow,
	items,
	title,
	tone,
}: {
	description: string;
	emptyLabel: string;
	eyebrow: string;
	items: OrderDetail["services"];
	title: string;
	tone: "active" | "picked" | "ready";
}) {
	const toneClassName =
		tone === "ready"
			? "border-emerald-500/20 bg-emerald-500/8"
			: tone === "picked"
				? "border-slate-900/10 bg-slate-900/5"
				: "border-amber-500/20 bg-amber-500/8";

	return (
		<div className={`grid gap-3 border p-4 ${toneClassName}`}>
			<div className="grid gap-1">
				<p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
					{eyebrow}
				</p>
				<h3 className="font-mono text-lg text-slate-950">{title}</h3>
				<p className="text-sm text-slate-600">{description}</p>
			</div>
			<div className="grid gap-2">
				{items.length === 0 ? (
					<p className="border border-dashed border-slate-300 bg-white/70 px-3 py-5 text-sm text-slate-500">
						{emptyLabel}
					</p>
				) : (
					items.map((service) => (
						<div
							key={service.id}
							className="grid gap-1 border border-slate-900/10 bg-white px-3 py-3"
						>
							<div className="flex items-center justify-between gap-3">
								<p className="font-medium text-slate-950">
									{service.item_code ?? `Service #${service.id}`}
								</p>
								<Badge variant="outline">
									{service.service?.name ?? "Service"}
								</Badge>
							</div>
							<p className="text-xs text-slate-500">
								{`${service.color ?? "-"} / ${service.shoe_brand ?? "-"} / ${service.shoe_size ?? "-"}`}
							</p>
						</div>
					))
				)}
			</div>
		</div>
	);
}
