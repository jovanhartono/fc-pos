import { Analytics01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { SectionTitle } from "@/components/section";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FinancialReport } from "@/features/reports/api";
import {
	compactMoney,
	percentFormatter,
} from "@/features/reports/utils/format";
import { useElementWidth } from "@/hooks/useElementWidth";
import { cn } from "@/lib/utils";

type Summary = FinancialReport["summary"]["current"];

interface SummaryProps {
	summary: Summary;
}

type MoneyViewId = "walk" | "flow";

export const MoneyWalkFlowCard = ({ summary }: SummaryProps) => {
	const [view, setView] = useState<MoneyViewId>("walk");
	const MoneyChart = view === "walk" ? MoneyWalk : MoneyFlow;
	return (
		<Card className="border-border/70 py-0">
			<CardContent className="grid gap-4 p-4">
				<div className="flex items-center justify-between gap-3">
					<SectionTitle title="Gross Sales to Gross Profit" />
					<Tabs
						onValueChange={(value) => setView(value as MoneyViewId)}
						value={view}
					>
						<TabsList aria-label="How to draw the money">
							<TabsTrigger value="walk">Walk</TabsTrigger>
							<TabsTrigger value="flow">Flow</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>
				{summary.gross_sales <= 0 && summary.collected <= 0 ? (
					<EmptyState icon={Analytics01Icon}>No data in range.</EmptyState>
				) : (
					<MoneyChart summary={summary} />
				)}
			</CardContent>
		</Card>
	);
};

interface WalkRow {
	label: string;
	value: number;
	// Where the bar starts, as money from the left edge.
	start: number;
	kind: "total" | "minus" | "plus";
}

const walkRows = (s: Summary): WalkRow[] => [
	{ label: "Gross sales", value: s.gross_sales, start: 0, kind: "total" },
	{
		label: "Discount",
		value: s.discount,
		start: s.gross_sales - s.discount,
		kind: "minus",
	},
	// Delivery fees reach Collected without passing through Gross sales (ADR-0029).
	...(s.delivery_fees > 0
		? [
				{
					label: "Delivery fees",
					value: s.delivery_fees,
					start: s.collected - s.delivery_fees,
					kind: "plus" as const,
				},
			]
		: []),
	{ label: "Collected", value: s.collected, start: 0, kind: "total" },
	{
		label: "Refunds",
		value: s.refunds,
		start: s.collected - s.refunds,
		kind: "minus",
	},
	{ label: "Revenue", value: s.revenue, start: 0, kind: "total" },
	{ label: "COGS", value: s.cogs, start: s.revenue - s.cogs, kind: "minus" },
	{ label: "Gross profit", value: s.gross_profit, start: 0, kind: "total" },
];

const WALK_FILL = {
	total: "bg-primary",
	minus: "bg-destructive",
	plus: "bg-success",
} as const;

const WALK_SIGN = { total: "", minus: "−", plus: "+" } as const;

// Each deduction sits where the total above it ended, so an owner follows
// the money down the page and sees what each step took out of Gross sales.
const MoneyWalk = ({ summary }: SummaryProps) => {
	const scale = Math.max(summary.gross_sales, summary.collected, 1);
	return (
		<ul className="grid gap-3">
			{walkRows(summary).map((row) => (
				<li
					className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-3 text-body tabular-nums sm:grid-cols-[6.5rem_1fr_5.5rem_2.75rem]"
					key={row.label}
				>
					<span
						className={
							row.kind === "total" ? "font-medium" : "text-muted-foreground"
						}
					>
						{row.label}
					</span>
					<span className="relative h-1.5 rounded-full bg-soft-bar-track">
						<span
							className={cn(
								"absolute inset-y-0 rounded-full",
								WALK_FILL[row.kind],
							)}
							style={{
								left: `${(Math.max(row.start, 0) / scale) * 100}%`,
								// A refund on last week's Order can outrun today's
								// takings; the bar stops at the track's end.
								width: `${(Math.min(Math.max(row.value, 0), scale - Math.max(row.start, 0)) / scale) * 100}%`,
							}}
						/>
					</span>
					<span
						className={cn("text-right", row.kind === "total" && "font-medium")}
					>
						{WALK_SIGN[row.kind]}
						{compactMoney(row.value)}
					</span>
					<span className="text-right text-muted-foreground max-sm:hidden">
						{percentFormatter.format(
							summary.gross_sales > 0 ? row.value / summary.gross_sales : 0,
						)}
					</span>
				</li>
			))}
		</ul>
	);
};

interface FlowNode {
	label: string;
	value: number;
	column: number;
	isKept: boolean;
}

const FLOW_HEIGHT = 240;
const FLOW_GAP = 28;
// Two label lines under the lowest node.
const FLOW_LABEL_ROOM = 32;
const NODE_WIDTH = 4;

// The same money as the Walk, drawn as ribbons for an owner who thinks of it
// as one stream splitting: blue is kept, red leaves.
const MoneyFlow = ({ summary: s }: SummaryProps) => {
	const { ref, width } = useElementWidth();
	const [picked, setPicked] = useState<number | null>(null);
	const revenue = Math.max(s.revenue, 0);
	const grossProfit = Math.max(s.gross_profit, 0);
	const nodes: FlowNode[] = [
		{ label: "Gross sales", value: s.gross_sales, column: 0, isKept: true },
		{ label: "Delivery fees", value: s.delivery_fees, column: 0, isKept: true },
		{ label: "Collected", value: s.collected, column: 1, isKept: true },
		{ label: "Discount", value: s.discount, column: 1, isKept: false },
		{ label: "Revenue", value: revenue, column: 2, isKept: true },
		{ label: "Refunds", value: s.refunds, column: 2, isKept: false },
		{ label: "Gross profit", value: grossProfit, column: 3, isKept: true },
		{ label: "COGS", value: s.cogs, column: 3, isKept: false },
	];
	const links = [
		{ from: 0, to: 2, value: Math.max(s.collected - s.delivery_fees, 0) },
		{ from: 0, to: 3, value: s.discount },
		{ from: 1, to: 2, value: s.delivery_fees },
		{ from: 2, to: 4, value: revenue },
		// No ribbon is wider than the node it leaves, even when refunds outrun
		// the day's takings or COGS outruns Revenue.
		{ from: 2, to: 5, value: Math.min(s.refunds, s.collected) },
		{ from: 4, to: 6, value: grossProfit },
		{ from: 4, to: 7, value: Math.min(s.cogs, revenue) },
	].filter((link) => link.value > 0);

	const columnTotals = [0, 0, 0, 0];
	for (const node of nodes) {
		columnTotals[node.column] += node.value;
	}
	const peak = Math.max(...columnTotals, 1);
	const px = (value: number) =>
		(value / peak) * (FLOW_HEIGHT - FLOW_GAP - FLOW_LABEL_ROOM);
	const labelWidth = width < 480 ? 74 : 104;
	const columnStep = Math.max(width - labelWidth - NODE_WIDTH, 0) / 3;

	// Each column stacks top down, what was kept above what left.
	const top: number[] = [];
	const cursor = [0, 0, 0, 0];
	nodes.forEach((node, index) => {
		top[index] = cursor[node.column];
		if (node.value > 0) {
			cursor[node.column] += px(node.value) + FLOW_GAP;
		}
	});
	const outAt = [...top];
	const inAt = [...top];
	const ribbons = links.map((link) => {
		const h = Math.max(px(link.value), 1);
		const x1 = nodes[link.from].column * columnStep + NODE_WIDTH;
		const x2 = nodes[link.to].column * columnStep;
		const y1 = outAt[link.from];
		const y2 = inAt[link.to];
		outAt[link.from] += h;
		inAt[link.to] += h;
		const mid = (x1 + x2) / 2;
		return {
			key: `${link.from}-${link.to}`,
			isKept: nodes[link.to].isKept,
			d: `M${x1},${y1}C${mid},${y1} ${mid},${y2} ${x2},${y2}V${y2 + h}C${mid},${y2 + h} ${mid},${y1 + h} ${x1},${y1 + h}Z`,
		};
	});

	return (
		<div className="min-w-0" ref={ref}>
			<svg
				aria-label="Money from Gross sales to Gross profit"
				height={FLOW_HEIGHT}
				role="img"
				width={width}
			>
				{ribbons.map((ribbon, index) => (
					<path
						className="transition-opacity duration-150 motion-reduce:transition-none"
						d={ribbon.d}
						fill={ribbon.isKept ? "var(--chart-1)" : "var(--destructive)"}
						key={ribbon.key}
						onPointerEnter={() => setPicked(index)}
						onPointerLeave={() => setPicked(null)}
						opacity={picked !== null && picked !== index ? 0.06 : 0.18}
					/>
				))}
				{nodes.map((node, index) =>
					node.value <= 0 ? null : (
						<g key={node.label}>
							<rect
								fill={node.isKept ? "var(--chart-1)" : "var(--destructive)"}
								height={Math.max(px(node.value), 2)}
								rx={NODE_WIDTH / 2}
								width={NODE_WIDTH}
								x={node.column * columnStep}
								y={top[index]}
							/>
							<text
								className="fill-muted-foreground text-footnote"
								x={node.column * columnStep + NODE_WIDTH + 6}
								y={top[index] + 11}
							>
								{node.label}
							</text>
							<text
								className="fill-foreground text-subhead font-medium tabular-nums"
								x={node.column * columnStep + NODE_WIDTH + 6}
								y={top[index] + 27}
							>
								{compactMoney(node.value)}
							</text>
						</g>
					),
				)}
			</svg>
		</div>
	);
};
