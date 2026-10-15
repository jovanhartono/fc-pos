import type { DayClose } from "@/features/counter/api";
import { CountBadge } from "@/features/counter/components/day-close/count-badge";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import { OrdersSheetContent } from "@/features/counter/components/day-close/orders-sheet-content";
import { formatDayLong } from "@/features/counter/lib/day-close";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";
import { useSheet } from "@/stores/sheet-store";

interface CollectedSectionProps {
	data: DayClose;
	dayLabel: string;
	isToday: boolean;
}

const LINE = "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3";
const SUB_LINE = `${LINE} pl-[18px] text-[13px] text-muted-foreground`;
const RECEIVED_BG = "bg-emerald-500/80 dark:bg-emerald-600/80";
const UNPAID_BG = "bg-rose-400/80 dark:bg-rose-500/60";

interface KeySquareProps {
	className: string;
}

const KeySquare = ({ className }: KeySquareProps) => (
	<span
		aria-hidden="true"
		className={`mr-2 inline-block size-2.5 ${className}`}
	/>
);

// Unpaid sits with the money so the owner sees what the day will bring in once
// every Order dropped off that day is paid.
export const CollectedSection = ({
	data,
	dayLabel,
	isToday,
}: CollectedSectionProps) => {
	const openSheet = useSheet((s) => s.openSheet);
	const { collected } = data;
	// is_paid is as of the day's close, so an Order paid the next day still
	// counts here as money the day was owed.
	const unpaidOrders = data.dropped_off.order_list.filter(
		(order) => !(order.is_paid || order.is_cancelled),
	);
	const unpaidAmount = unpaidOrders.reduce(
		(sum, order) => sum + order.amount,
		0,
	);
	const hasUnpaid = unpaidOrders.length > 0;
	const expected = collected.amount + unpaidAmount;

	const handleOpenUnpaid = () => {
		openSheet({
			title: "Unpaid Orders",
			description: `${formatDayLong(data.date)} · ${pluralize(unpaidOrders.length, "Order")} · ${formatMoney(unpaidAmount)}`,
			size: "wide",
			content: () => <OrdersSheetContent orders={unpaidOrders} />,
		});
	};

	return (
		<section className="grid gap-2.5 border border-border p-3.5 tabular-nums">
			<div className={LINE}>
				<span>
					{hasUnpaid
						? `Expected for ${isToday ? "today" : dayLabel}`
						: "Received"}
				</span>
				<span className="text-right font-medium text-2xl">
					{formatMoney(expected)}
				</span>
			</div>
			{hasUnpaid ? (
				<div aria-hidden="true" className="flex h-2.5 bg-muted">
					<span
						className={RECEIVED_BG}
						style={{
							width: `${expected > 0 ? (collected.amount / expected) * 100 : 0}%`,
						}}
					/>
					<span className={`flex-1 ${UNPAID_BG}`} />
				</div>
			) : null}
			<div className="grid gap-1.5">
				{hasUnpaid ? (
					<div className={LINE}>
						<span>
							<KeySquare className={RECEIVED_BG} />
							Received
						</span>
						<span className="text-right font-medium text-emerald-700 dark:text-emerald-300">
							{formatMoney(collected.amount)}
							<OpenArrow className="invisible" />
						</span>
					</div>
				) : null}
				<div className={SUB_LINE}>
					<span>{dayLabel} Orders</span>
					<span className="text-right">
						{formatMoney(collected.this_day)}
						{hasUnpaid ? <OpenArrow className="invisible" /> : null}
					</span>
				</div>
				<div className={SUB_LINE}>
					<span>Earlier Orders</span>
					<span className="text-right">
						{formatMoney(collected.earlier)}
						{hasUnpaid ? <OpenArrow className="invisible" /> : null}
					</span>
				</div>
				{hasUnpaid ? (
					<button
						className={`${LINE} -mx-2.5 px-2.5 py-1.5 text-left hover:bg-muted`}
						onClick={handleOpenUnpaid}
						type="button"
					>
						<span>
							<KeySquare className={UNPAID_BG} />
							Unpaid
							<CountBadge count={unpaidOrders.length} />
						</span>
						<span className="text-right font-medium text-rose-700 dark:text-rose-300">
							{formatMoney(unpaidAmount)}
							<OpenArrow />
						</span>
					</button>
				) : null}
			</div>
		</section>
	);
};
