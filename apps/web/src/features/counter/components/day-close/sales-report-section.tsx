import { Section } from "@/components/section";
import type { DayClose } from "@/features/counter/api";
import {
	GroupLabel,
	LINE_ROW,
	LineName,
} from "@/features/counter/components/day-close/group-label";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import { pluralize } from "@/shared/utils";

interface CountGroupProps {
	count?: number;
	// Two Services or Products can share a name, so rows go by their id.
	lines: { count: number; id: number; name: string }[];
	title: string;
}

const CountGroup = ({ count, lines, title }: CountGroupProps) => (
	<div className="border-border border-t">
		<GroupLabel end={count} title={title} />
		{lines.map((line) => (
			<div className={LINE_ROW} key={line.id}>
				<LineName>{line.name}</LineName>
				<span className="text-right">{line.count}</span>
			</div>
		))}
	</div>
);

interface SalesReportSectionProps {
	data: DayClose;
	onOpen: (list: string) => void;
}

export const SalesReportSection = ({
	data,
	onOpen,
}: SalesReportSectionProps) => {
	const { dropped_off: dropped } = data;

	const summary = [
		pluralize(dropped.orders, "Order"),
		pluralize(dropped.items, "Item"),
		pluralize(dropped.services, "Service"),
		dropped.products > 0 ? pluralize(dropped.products, "Product") : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<Section title="Sales Report">
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
				{dropped.categories.map((category) => (
					<CountGroup
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
		</Section>
	);
};
