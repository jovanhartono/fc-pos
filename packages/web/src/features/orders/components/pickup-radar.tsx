import { ArrowRightIcon, SparkleIcon, ToteIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Order } from "@/lib/api";
import {
	formatOrderPickupState,
	getOrderPickupStateBadgeVariant,
} from "@/lib/status";
import { formatIDRCurrency } from "@/shared/utils";

type PickupRadarProps = {
	orders: Order[];
};

export function PickupRadar({ orders }: PickupRadarProps) {
	const readyOrders = orders.filter(
		(order) => order.fulfillment.is_ready_for_pickup,
	);
	const partialOrders = orders.filter(
		(order) => order.fulfillment.is_partially_picked_up,
	);

	return (
		<section className="grid gap-4 border border-slate-900/10 bg-[linear-gradient(135deg,rgba(255,251,235,0.9),rgba(255,255,255,0.95)_40%,rgba(236,253,245,0.92))] p-4">
			<div className="grid gap-1">
				<p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-500">
					Pickup Radar
				</p>
				<h2 className="font-mono text-lg text-slate-950">
					Orders that can leave the store now.
				</h2>
				<p className="text-sm text-slate-600">
					Ready orders and partially collected orders are surfaced here before
					you drop into the historical table.
				</p>
			</div>

			<div className="grid gap-4 xl:grid-cols-2">
				<RadarColumn
					orders={readyOrders}
					eyebrow="Ready"
					title="Ready for pickup"
					icon={<SparkleIcon className="size-4" />}
					emptyLabel="None."
					tone="ready"
				/>
				<RadarColumn
					orders={partialOrders}
					eyebrow="Partial"
					title="Partially picked up"
					icon={<ToteIcon className="size-4" />}
					emptyLabel="None."
					tone="partial"
				/>
			</div>
		</section>
	);
}

function RadarColumn({
	emptyLabel,
	eyebrow,
	icon,
	orders,
	title,
	tone,
}: {
	emptyLabel: string;
	eyebrow: string;
	icon: ReactNode;
	orders: Order[];
	title: string;
	tone: "partial" | "ready";
}) {
	const toneClassName =
		tone === "ready"
			? "border-emerald-500/20 bg-emerald-500/7"
			: "border-amber-500/20 bg-amber-500/7";

	return (
		<div className={`grid gap-3 border p-4 ${toneClassName}`}>
			<div className="grid gap-1">
				<div className="flex items-center gap-2 text-slate-600">
					{icon}
					<p className="text-[10px] font-semibold uppercase tracking-[0.28em]">
						{eyebrow}
					</p>
				</div>
				<h3 className="font-mono text-lg text-slate-950">{title}</h3>
			</div>
			<div className="grid gap-3">
				{orders.length === 0 ? (
					<p className="border border-dashed border-slate-300 bg-white/80 px-3 py-8 text-center text-sm text-slate-500">
						{emptyLabel}
					</p>
				) : (
					orders.map((order) => (
						<Card
							key={order.id}
							className="border border-slate-900/10 bg-white/95 py-0 shadow-none"
							size="sm"
						>
							<CardContent className="grid gap-3 py-3">
								<div className="flex items-start justify-between gap-3">
									<div className="grid gap-1">
										<p className="font-medium text-slate-950">{order.code}</p>
										<p className="text-xs text-slate-500">
											{`${order.customer_name} • ${order.store_name}`}
										</p>
									</div>
									<Badge
										variant={getOrderPickupStateBadgeVariant(order.fulfillment)}
									>
										{formatOrderPickupState(order.fulfillment)}
									</Badge>
								</div>
								<div className="grid gap-1 text-xs text-slate-600 md:grid-cols-3">
									<p>{`${order.fulfillment.ready_for_pickup_count} ready`}</p>
									<p>{`${order.fulfillment.picked_up_count} picked up`}</p>
									<p>{`${order.fulfillment.remaining_count} still active`}</p>
								</div>
								<div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
									<p className="font-mono text-sm text-slate-950">
										{formatIDRCurrency(String(order.total ?? 0))}
									</p>
									<Link
										to="/orders/$orderId"
										params={{ orderId: String(order.id) }}
										className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700 transition-colors hover:text-slate-950"
									>
										Inspect
										<ArrowRightIcon className="size-3.5" />
									</Link>
								</div>
							</CardContent>
						</Card>
					))
				)}
			</div>
		</div>
	);
}
