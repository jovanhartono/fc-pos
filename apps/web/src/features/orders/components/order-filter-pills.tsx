import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import type { OrderFilterValues } from "@/features/orders/components/order-filters";
import type { OrderListCounts } from "@/lib/api";
import { cn } from "@/lib/utils";

// Every pill owns the same five fields, so switching from Unpaid to Overdue
// cannot leave the payment filter behind — the pill you can see is the whole
// filter that is applied.
const PILL_FIELDS = [
	"status",
	"paymentStatus",
	"overdue",
	"dateFrom",
	"dateTo",
] as const;

type OrderFilterPillPatch = Pick<
	OrderFilterValues,
	(typeof PILL_FIELDS)[number]
>;

const CLEARED: OrderFilterPillPatch = {
	status: undefined,
	paymentStatus: undefined,
	overdue: undefined,
	dateFrom: undefined,
	dateTo: undefined,
};

interface OrderFilterPill {
	// Doubles as the counts key — a pill can't show a number that belongs to a
	// different question than the one it filters by.
	key: keyof OrderListCounts;
	label: string;
	patch: OrderFilterPillPatch;
}

const buildPills = (today: string): OrderFilterPill[] => [
	{ key: "all", label: "All", patch: CLEARED },
	{
		key: "today",
		label: "Today",
		patch: { ...CLEARED, dateFrom: today, dateTo: today },
	},
	{
		key: "unpaid",
		label: "Unpaid",
		patch: { ...CLEARED, paymentStatus: "unpaid" },
	},
	{
		key: "ready_for_pickup",
		label: "Ready for pickup",
		patch: { ...CLEARED, status: "ready_for_pickup" },
	},
	{ key: "overdue", label: "Overdue", patch: { ...CLEARED, overdue: true } },
];

const isPillActive = (patch: OrderFilterPillPatch, values: OrderFilterValues) =>
	PILL_FIELDS.every((field) => patch[field] === values[field]);

interface OrderFilterPillsProps {
	values: OrderFilterValues;
	counts?: OrderListCounts;
	onChange: (patch: Partial<OrderFilterValues>) => void;
}

// The counts are the filters. Four controls that all read "All …" say nothing
// until someone operates them, so the one fact worth acting on — three orders
// nobody has collected — was invisible until you went looking. Now it is the
// first thing on the page, and clicking it is the filter.
export const OrderFilterPills = ({
	values,
	counts,
	onChange,
}: OrderFilterPillsProps) => {
	const pills = buildPills(dayjs().format("YYYY-MM-DD"));

	return (
		<fieldset className="mb-3 flex min-w-0 flex-wrap gap-1 border-0 p-0">
			<legend className="sr-only">Filter orders</legend>
			{pills.map((pill) => {
				const isActive = isPillActive(pill.patch, values);
				const count = counts?.[pill.key];
				// Overdue earns its colour only when there is something to chase, and
				// only while it isn't the filter — an active pill reads as selected,
				// not as an alarm.
				const isAlarm = pill.key === "overdue" && !isActive && !!count;

				return (
					<Button
						aria-pressed={isActive}
						className={cn(
							"gap-1.5 font-mono uppercase tracking-[0.14em]",
							isAlarm && "border-destructive/50 text-destructive",
						)}
						key={pill.key}
						onClick={() => onChange(pill.patch)}
						size="sm"
						type="button"
						variant={isActive ? "default" : "outline"}
					>
						{pill.label}
						{count === undefined ? null : (
							<span className="font-semibold tabular-nums">{count}</span>
						)}
					</Button>
				);
			})}
		</fieldset>
	);
};
