import { CaretRightIcon } from "@phosphor-icons/react";
import { Section } from "@/components/section";
import type { DayClose } from "@/features/counter/api";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import { pluralize } from "@/shared/utils";

interface CountGroupProps {
	count: number;
	// Two Services or Products can share a name, so rows go by their id.
	lines: { count: number; id: number; name: string }[];
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
				className="flex justify-between gap-3 border-border border-t py-1.5 pr-3 pl-7 text-body"
				key={line.id}
			>
				<span>{line.name}</span>
				<span className="tabular-nums">{line.count}</span>
			</div>
		))}
	</details>
);

interface SalesReportSectionProps {
	data: DayClose;
	onOpen: (list: string) => void;
}

export const SalesReportSection = ({
	data,
	onOpen,
}: SalesReportSectionProps) => {
	const { dropped_off: dropped, picked_up: picked } = data;

	const summary = [
		pluralize(dropped.orders, "Order"),
		pluralize(dropped.items, "Item"),
		pluralize(dropped.services, "Service"),
		dropped.products > 0 ? pluralize(dropped.products, "Product") : null,
	]
		.filter(Boolean)
		.join(" · ");
	const hasLines =
		dropped.categories.length > 0 || dropped.product_lines.length > 0;
	const pickedUp = `${pluralize(picked.orders, "Order")} · ${pluralize(picked.items, "Item")}`;

	return (
		<Section title="Sales report">
			<div className="overflow-hidden rounded-lg border bg-card">
				<button
					className="flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted"
					onClick={() => onOpen("orders")}
					type="button"
				>
					<span className="font-medium tabular-nums">{summary}</span>
					<span className="whitespace-nowrap">
						All Orders
						<OpenArrow />
					</span>
				</button>
				{hasLines ? (
					<div className="flex justify-between gap-3 border-border border-t bg-muted px-3 py-2 font-medium text-footnote">
						<span>Sold</span>
						<span>Qty</span>
					</div>
				) : null}
				{dropped.categories.map((category) => (
					<CountGroup
						count={category.count}
						key={category.name}
						lines={category.services.map((line) => ({
							count: line.count,
							id: line.service_id,
							name: line.name,
						}))}
						title={category.name}
					/>
				))}
				{dropped.product_lines.length > 0 ? (
					<CountGroup
						count={dropped.products}
						lines={dropped.product_lines.map((line) => ({
							count: line.qty,
							id: line.product_id,
							name: line.name,
						}))}
						title="Products"
					/>
				) : null}
			</div>
			<button
				className="flex w-full items-baseline justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-left enabled:hover:bg-muted"
				disabled={picked.orders === 0}
				onClick={() => onOpen("picked-up")}
				type="button"
			>
				<span>Picked up</span>
				<span className="tabular-nums">
					{pickedUp}
					{picked.orders > 0 ? <OpenArrow /> : null}
				</span>
			</button>
		</Section>
	);
};
