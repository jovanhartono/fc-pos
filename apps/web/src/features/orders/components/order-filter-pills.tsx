import { Button } from "@/components/ui/button";
import type { OrderFilterValues } from "@/features/orders/components/order-filters";
import type { OrderListCounts } from "@/lib/api";
import { cn } from "@/lib/utils";

// Every pill patches all five, so switching from Unpaid to Overdue cannot leave
// the payment filter behind.
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
	// Doubles as the counts key, so a pill cannot show a number for one question
	// while filtering by another.
	key: keyof OrderListCounts;
	label: string;
	patch: OrderFilterPillPatch;
}

// Jakarta's date, never the device's: the server counts "today" with
// jakartaNow(), and dayjs runs vanilla here, so a tablet left on UTC would send
// a date_from the count never used. en-CA is the locale that prints YYYY-MM-DD.
const jakartaDateFormat = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Jakarta",
});
const jakartaToday = () => jakartaDateFormat.format(new Date());

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
	// "Ready for pickup" set in tracked uppercase is 17 characters and wraps the
	// row onto a second line on a phone. The pill sits next to Overdue, which is
	// the same shelf — "Ready" is not ambiguous here.
	{
		key: "ready_for_pickup",
		label: "Ready",
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

export const OrderFilterPills = ({
	values,
	counts,
	onChange,
}: OrderFilterPillsProps) => {
	const pills = buildPills(jakartaToday());

	return (
		<fieldset className="mb-3 flex min-w-0 flex-wrap gap-1 border-0 p-0">
			<legend className="sr-only">Filter orders</legend>
			{pills.map((pill) => {
				const isActive = isPillActive(pill.patch, values);
				const count = counts?.[pill.key];
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
