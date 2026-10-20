import type { DayClose } from "@/features/counter/api";
import { CountBadge } from "@/features/counter/components/day-close/count-badge";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import { unpaidOrdersOf } from "@/features/counter/lib/day-close";
import { formatMoney } from "@/shared/money";

interface CollectedSectionProps {
	data: DayClose;
	dayLabel: string;
	isToday: boolean;
	onOpen: (list: string) => void;
}

const LINE = "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3";
const SUB_LINE = `${LINE} pl-4 text-body`;
const RECEIVED_BG = "bg-success";
const UNPAID_BG = "bg-destructive/70";

interface KeyDotProps {
	className: string;
}

const KeyDot = ({ className }: KeyDotProps) => (
	<span
		aria-hidden="true"
		className={`mr-2 inline-block size-2 rounded-full align-middle ${className}`}
	/>
);

// Unpaid sits with the money so the owner sees what the day will bring in once
// every Order dropped off that day is paid.
export const CollectedSection = ({
	data,
	dayLabel,
	isToday,
	onOpen,
}: CollectedSectionProps) => {
	const { collected } = data;
	const unpaidOrders = unpaidOrdersOf(data);
	const unpaidAmount = unpaidOrders.reduce(
		(sum, order) => sum + order.amount,
		0,
	);
	const hasUnpaid = unpaidOrders.length > 0;
	const expected = collected.amount + unpaidAmount;

	return (
		<section className="grid gap-2.5 rounded-lg border bg-card p-3.5 tabular-nums">
			<div className={LINE}>
				<span>
					{hasUnpaid
						? `Expected for ${isToday ? "today" : dayLabel}`
						: "Received"}
				</span>
				<span className="text-right font-medium text-title-1">
					{formatMoney(expected)}
				</span>
			</div>
			{hasUnpaid ? (
				<div aria-hidden="true" className="flex h-1.5 gap-0.5">
					<span
						className={`rounded-full ${RECEIVED_BG}`}
						style={{
							width: `${expected > 0 ? (collected.amount / expected) * 100 : 0}%`,
						}}
					/>
					<span className={`flex-1 rounded-full ${UNPAID_BG}`} />
				</div>
			) : null}
			<div className="grid gap-1.5">
				{hasUnpaid ? (
					<div className={LINE}>
						<span>
							<KeyDot className={RECEIVED_BG} />
							Received
						</span>
						<span className="text-right font-medium text-tone-good-foreground">
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
						className={`${LINE} -mx-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-muted`}
						onClick={() => onOpen("unpaid")}
						type="button"
					>
						<span>
							<KeyDot className={UNPAID_BG} />
							Unpaid
							<CountBadge count={unpaidOrders.length} />
						</span>
						<span className="text-right font-medium text-tone-bad-foreground">
							{formatMoney(unpaidAmount)}
							<OpenArrow />
						</span>
					</button>
				) : null}
			</div>
		</section>
	);
};
