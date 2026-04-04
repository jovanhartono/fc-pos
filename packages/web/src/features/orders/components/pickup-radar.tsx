import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import type { Order } from "@/lib/api";
import { formatOrderStatus, getOrderStatusBadgeVariant } from "@/lib/status";
import { formatIDRCurrency } from "@/shared/utils";

type PickupRadarProps = {
	orders: Order[];
};

export function PickupRadar({ orders }: PickupRadarProps) {
	const readyOrders = orders.filter(
		(order) => order.status === "ready_for_pickup",
	);

	if (readyOrders.length === 0) {
		return (
			<p className="py-12 text-center text-sm text-slate-400">
				No pickups right now.
			</p>
		);
	}

	return (
		<div className="grid gap-6">
			<RadarSection
				label="Ready"
				count={readyOrders.length}
				orders={readyOrders}
			/>
		</div>
	);
}

function RadarSection({
	count,
	label,
	orders,
}: {
	count: number;
	label: string;
	orders: Order[];
}) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center gap-2 border-b border-slate-200 pb-2">
				<p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
					{label}
				</p>
				<span className="inline-flex h-4 min-w-4 items-center justify-center bg-slate-900 px-1 text-[10px] font-semibold tabular-nums text-white">
					{count}
				</span>
			</div>
			<div className="grid gap-1">
				{orders.map((order) => (
					<RadarRow key={order.id} order={order} />
				))}
			</div>
		</div>
	);
}

function RadarRow({ order }: { order: Order }) {
	return (
		<Link
			to="/orders/$orderId"
			params={{ orderId: String(order.id) }}
			className="group grid grid-cols-[1fr_auto] items-center gap-3 border border-transparent px-2 py-2.5 transition-colors hover:border-slate-200 hover:bg-slate-50"
		>
			<div className="grid gap-1 overflow-hidden">
				<div className="flex items-center gap-2">
					<p className="truncate font-mono text-sm font-medium text-slate-950">
						{order.code}
					</p>
					<Badge variant={getOrderStatusBadgeVariant(order.status)}>
						{formatOrderStatus(order.status)}
					</Badge>
				</div>
				<div className="flex items-center gap-3 text-xs text-slate-500">
					<span>{order.customer_name}</span>
					<span className="text-slate-300">/</span>
					<span>{order.store_name}</span>
				</div>
			</div>
			<div className="flex items-center gap-3">
				<p className="font-mono text-xs text-slate-600">
					{formatIDRCurrency(String(order.total ?? 0))}
				</p>
				<ArrowRightIcon className="size-3.5 text-slate-300 transition-colors group-hover:text-slate-700" />
			</div>
		</Link>
	);
}
