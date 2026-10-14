import { CaretRightIcon } from "@phosphor-icons/react";
import type { DayClose, DayCloseOrder } from "@/features/counter/api";
import { OrderCodeLink } from "@/features/counter/components/day-close/order-code-link";
import {
	formatClock,
	formatDayLong,
	formatDayShort,
} from "@/features/counter/lib/day-close";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";
import { useSheet } from "@/stores/sheet-store";

interface CountGroupProps {
	count: number;
	lines: { count: number; name: string }[];
	title: string;
}

const CountGroup = ({ count, lines, title }: CountGroupProps) => (
	<details className="group border-border border-t">
		<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 hover:bg-muted [&::-webkit-details-marker]:hidden">
			<span className="flex items-center gap-1.5">
				<CaretRightIcon className="size-3 text-muted-foreground transition-transform group-open:rotate-90" />
				{title}
			</span>
			<span className="tabular-nums">{count}</span>
		</summary>
		{lines.map((line) => (
			<div
				className="flex justify-between gap-3 border-border border-t py-1.5 pr-3 pl-7 text-[13.5px]"
				key={line.name}
			>
				<span>{line.name}</span>
				<span className="text-muted-foreground tabular-nums">{line.count}</span>
			</div>
		))}
	</details>
);

interface PaymentCellProps {
	order: DayCloseOrder;
}

const PaymentCell = ({ order }: PaymentCellProps) => {
	if (order.is_cancelled) {
		return <span className="text-muted-foreground">Cancelled</span>;
	}
	if (order.is_paid) {
		return <span>{order.payment_method_name}</span>;
	}
	if (order.paid_day) {
		return (
			<span className="whitespace-nowrap bg-muted px-1.5 text-foreground text-xs">
				Paid {formatDayShort(order.paid_day)}
			</span>
		);
	}
	return (
		<span className="whitespace-nowrap bg-warning/15 px-1.5 text-foreground text-xs">
			Unpaid
		</span>
	);
};

interface OrdersSheetContentProps {
	orders: DayCloseOrder[];
}

const OrdersSheetContent = ({ orders }: OrdersSheetContentProps) => {
	const isMobile = useIsMobile();

	if (orders.length === 0) {
		return <p className="text-muted-foreground">No Orders dropped off.</p>;
	}

	if (isMobile) {
		return (
			<ul>
				{orders.map((order) => (
					<li
						className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-border border-b py-2.5"
						key={order.order_id}
					>
						<OrderCodeLink code={order.order_code} orderId={order.order_id} />
						<span className="tabular-nums">{formatMoney(order.amount)}</span>
						<span className="col-span-full flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground text-xs">
							{formatClock(order.created_at)} · {pluralize(order.items, "Item")}{" "}
							· <PaymentCell order={order} />
						</span>
					</li>
				))}
			</ul>
		);
	}

	return (
		<table className="w-full text-sm">
			<tbody>
				{orders.map((order) => (
					<tr className="border-border border-b" key={order.order_id}>
						<td className="whitespace-nowrap py-2 pr-3 text-muted-foreground tabular-nums">
							{formatClock(order.created_at)}
						</td>
						<td className="py-2 pr-3">
							<OrderCodeLink code={order.order_code} orderId={order.order_id} />
						</td>
						<td className="whitespace-nowrap py-2 pr-3 text-muted-foreground tabular-nums">
							{pluralize(order.items, "Item")}
						</td>
						<td className="w-full py-2 pr-3">
							<PaymentCell order={order} />
						</td>
						<td className="whitespace-nowrap py-2 text-right tabular-nums">
							{formatMoney(order.amount)}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
};

interface DroppedOffSectionProps {
	data: DayClose;
}

export const DroppedOffSection = ({ data }: DroppedOffSectionProps) => {
	const openSheet = useSheet((s) => s.openSheet);
	const { dropped_off: dropped, picked_up: picked, unpaid } = data;

	const handleOpenOrders = () =>
		openSheet({
			title: "Dropped off",
			description: `${formatDayLong(data.date)} · ${pluralize(dropped.orders, "Order")}`,
			size: "wide",
			content: () => <OrdersSheetContent orders={dropped.order_list} />,
		});

	const summary = [
		pluralize(dropped.orders, "Order"),
		pluralize(dropped.items, "Item"),
		pluralize(dropped.services, "Service"),
		dropped.products > 0 ? pluralize(dropped.products, "Product") : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<section className="grid gap-2.5">
			<h2 className="font-medium text-[15px]">Dropped off</h2>
			<div className="border border-border">
				<button
					className="flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted"
					onClick={handleOpenOrders}
					type="button"
				>
					<span className="font-medium tabular-nums">{summary}</span>
					<span className="whitespace-nowrap text-muted-foreground">
						All Orders ›
					</span>
				</button>
				{dropped.categories.map((category) => (
					<CountGroup
						count={category.count}
						key={category.name}
						lines={category.services}
						title={category.name}
					/>
				))}
				{dropped.product_lines.length > 0 ? (
					<CountGroup
						count={dropped.products}
						lines={dropped.product_lines.map((line) => ({
							count: line.qty,
							name: line.name,
						}))}
						title="Products"
					/>
				) : null}
			</div>
			<div className="grid border border-border sm:grid-cols-2">
				<div className="flex justify-between gap-3 px-3 py-2.5 sm:grid sm:justify-normal sm:gap-0.5">
					<span className="text-muted-foreground">Picked up</span>
					<span className="font-medium tabular-nums">
						{pluralize(picked.orders, "Order")}{" "}
						<span className="font-normal text-muted-foreground">
							· {pluralize(picked.items, "Item")}
						</span>
					</span>
				</div>
				<div className="flex justify-between gap-3 border-border border-t px-3 py-2.5 sm:grid sm:justify-normal sm:gap-0.5 sm:border-t-0 sm:border-l">
					<span className="text-muted-foreground">Dropped off unpaid</span>
					<span className="font-medium tabular-nums">
						{pluralize(unpaid.orders, "Order")}
						{unpaid.amount > 0 ? (
							<span className="font-normal text-muted-foreground">
								{" "}
								· {formatMoney(unpaid.amount)}
							</span>
						) : null}
					</span>
				</div>
			</div>
		</section>
	);
};
