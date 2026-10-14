import { CaretRightIcon } from "@phosphor-icons/react";
import type { DayClose } from "@/features/counter/api";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import { OrdersSheetContent } from "@/features/counter/components/day-close/orders-sheet-content";
import { PickedUpSheetContent } from "@/features/counter/components/day-close/picked-up-sheet-content";
import { formatDayLong } from "@/features/counter/lib/day-close";
import { pluralize } from "@/shared/utils";
import { useSheet } from "@/stores/sheet-store";

interface CountGroupProps {
	count: number;
	lines: { count: number; name: string }[];
	title: string;
}

const CountGroup = ({ count, lines, title }: CountGroupProps) => (
	<details className="group border-border border-t" open>
		<summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-muted/50 px-3 py-2 font-medium hover:bg-muted [&::-webkit-details-marker]:hidden">
			<span className="flex items-center gap-1.5">
				<CaretRightIcon className="size-3 text-muted-foreground transition-transform group-open:rotate-90" />
				{title}
			</span>
			<span className="tabular-nums">{count}</span>
		</summary>
		{lines.map((line) => (
			<div
				className="flex justify-between gap-3 border-border border-t py-1.5 pr-3 pl-7 text-[13.5px] text-muted-foreground"
				key={line.name}
			>
				<span>{line.name}</span>
				<span className="text-foreground/80 tabular-nums">{line.count}</span>
			</div>
		))}
	</details>
);

interface SalesReportSectionProps {
	data: DayClose;
	dayLabel: string;
}

export const SalesReportSection = ({
	data,
	dayLabel,
}: SalesReportSectionProps) => {
	const openSheet = useSheet((s) => s.openSheet);
	const { dropped_off: dropped, picked_up: picked } = data;
	const ordersTitle = `${dayLabel} Orders`;

	const handleOpenOrders = () =>
		openSheet({
			title: ordersTitle,
			description: `${formatDayLong(data.date)} · ${pluralize(dropped.orders, "Order")}`,
			size: "wide",
			content: () => <OrdersSheetContent orders={dropped.order_list} />,
		});

	const handleOpenPickedUp = () =>
		openSheet({
			title: "Picked up",
			description: `${formatDayLong(data.date)} · ${pluralize(picked.orders, "Order")} · ${pluralize(picked.items, "Item")}`,
			size: "wide",
			content: () => (
				<PickedUpSheetContent date={data.date} orders={picked.order_list} />
			),
		});

	const summary = [
		pluralize(dropped.orders, "Order"),
		pluralize(dropped.items, "Item"),
		pluralize(dropped.services, "Service"),
		dropped.products > 0 ? pluralize(dropped.products, "Product") : null,
	]
		.filter(Boolean)
		.join(" · ");
	const pickedUp = `${pluralize(picked.orders, "Order")} · ${pluralize(picked.items, "Item")}`;

	return (
		<section className="grid gap-2.5">
			<h2 className="font-medium text-base">Sales Report</h2>
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
			<button
				className="flex w-full items-baseline justify-between gap-3 border border-border px-3 py-2.5 text-left enabled:hover:bg-muted"
				disabled={picked.orders === 0}
				onClick={handleOpenPickedUp}
				type="button"
			>
				<span className="text-muted-foreground">Picked up</span>
				<span className="tabular-nums">
					{pickedUp}
					{picked.orders > 0 ? <OpenArrow /> : null}
				</span>
			</button>
		</section>
	);
};
