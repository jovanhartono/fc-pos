import { CaretRightIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
		<Card>
			<CardContent className="space-y-5 pt-6">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0 space-y-3">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant={getOrderPickupStateBadgeVariant(fulfillment)}>
								{formatOrderPickupState(fulfillment)}
							</Badge>
							<span className="text-muted-foreground text-sm tabular-nums">
								{fulfillment.service_total_count} line
								{fulfillment.service_total_count === 1 ? "" : "s"}
							</span>
						</div>
						<div className="flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums">
							<StatInline
								label="Ready"
								value={fulfillment.ready_for_pickup_count}
							/>
							<StatInline label="Active" value={fulfillment.active_count} />
							<StatInline
								label="Picked up"
								value={fulfillment.picked_up_count}
							/>
							<StatInline
								label="Remaining"
								value={fulfillment.remaining_count}
							/>
						</div>
						<div className="bg-muted h-1.5 w-full max-w-md overflow-hidden">
							<div
								className="bg-primary h-full transition-[width] duration-300"
								style={{ width: `${progressWidth}%` }}
							/>
						</div>
					</div>
					<div className="flex w-full flex-col gap-2 sm:max-w-xs sm:shrink-0">
						<Button
							type="button"
							loading={isCompleting}
							loadingText="Completing…"
							disabled={!canCompletePickup}
							onClick={onCompletePickup}
						>
							{fulfillment.is_partially_picked_up
								? "Complete remaining pickup"
								: "Mark order completed"}
						</Button>
						<p className="text-muted-foreground text-xs leading-relaxed">
							{canCompletePickup
								? "Marks all ready lines as picked up once nothing is still in queue, processing, or quality check."
								: "Available when every active line is ready for pickup."}
						</p>
					</div>
				</div>

				<Separator />

				<details className="group">
					<summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden [&::marker]:hidden">
						<CaretRightIcon
							className="size-4 shrink-0 transition-transform group-open:rotate-90"
							aria-hidden="true"
						/>
						Items by stage
					</summary>
					<div className="mt-4 grid gap-4 md:grid-cols-3">
						<LaneList
							title="In progress"
							empty="No active work."
							items={inFlightServices}
						/>
						<LaneList
							title="Ready for pickup"
							empty="Nothing staged yet."
							items={readyServices}
						/>
						<LaneList
							title="Picked up"
							empty="Nothing collected yet."
							items={pickedUpServices}
						/>
					</div>
				</details>
			</CardContent>
		</Card>
	);
}

function StatInline({ label, value }: { label: string; value: number }) {
	return (
		<div>
			<span className="text-muted-foreground">{label}</span>
			<span className="text-foreground ml-1.5 font-medium">{value}</span>
		</div>
	);
}

function LaneList({
	empty,
	items,
	title,
}: {
	empty: string;
	items: OrderDetail["services"];
	title: string;
}) {
	return (
		<div className="space-y-2">
			<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
				{title}
			</p>
			{items.length === 0 ? (
				<p className="text-muted-foreground border-muted bg-muted/30 border border-dashed px-3 py-4 text-sm">
					{empty}
				</p>
			) : (
				<ul className="space-y-2">
					{items.map((service) => (
						<li key={service.id} className="bg-card border px-3 py-2.5 text-sm">
							<p className="font-medium leading-snug">
								{service.item_code ?? `Service #${service.id}`}
							</p>
							<p className="text-muted-foreground mt-0.5 text-xs">
								{service.service?.name ?? "Service"} · {service.color ?? "-"} /{" "}
								{service.shoe_brand ?? "-"} / {service.shoe_size ?? "-"}
							</p>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
