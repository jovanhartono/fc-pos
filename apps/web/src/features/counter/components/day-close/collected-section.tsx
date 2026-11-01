import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import type { DayClose } from "@/features/counter/api";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import { unpaidOrdersOf } from "@/features/counter/lib/day-close";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

interface CollectedSectionProps {
	data: DayClose;
	dayLabel: string;
	isToday: boolean;
	onOpen: (list: string) => void;
}

const LINE = "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3";
const EARLIER_BG = "bg-success/40";

interface KeyDotProps {
	className: string;
}

const KeyDot = ({ className }: KeyDotProps) => (
	<span
		aria-hidden="true"
		className={cn(
			"mr-2 inline-block size-2 rounded-full align-middle",
			className,
		)}
	/>
);

// Received leads because it is the money already in the drawer and the bank;
// Unpaid sits under it so the owner sees what the day brings in once paid.
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
	const hasEarlier = collected.earlier > 0;
	const when = isToday ? "today" : dayLabel;

	return (
		<Section title="Received">
			<div className="overflow-hidden rounded-lg border bg-card tabular-nums">
				<div className="grid gap-2.5 p-3.5">
					<span className="font-medium text-title-1 text-tone-good-foreground">
						{formatMoney(collected.amount)}
					</span>
					{hasEarlier ? (
						<div aria-hidden="true" className="flex h-1.5 gap-0.5">
							<span
								className="rounded-full bg-success"
								style={{
									width: `${(collected.this_day / collected.amount) * 100}%`,
								}}
							/>
							<span className={cn("flex-1 rounded-full", EARLIER_BG)} />
						</div>
					) : null}
					<div className="grid gap-1.5">
						<div className={LINE}>
							<span>
								{hasEarlier ? <KeyDot className="bg-success" /> : null}
								From Orders dropped off {when}
							</span>
							<span className="text-right">
								{formatMoney(collected.this_day)}
							</span>
						</div>
						<div className={LINE}>
							<span>
								{hasEarlier ? <KeyDot className={EARLIER_BG} /> : null}
								From earlier Orders
							</span>
							<span
								className={cn(
									"text-right",
									!hasEarlier && "text-muted-foreground",
								)}
							>
								{hasEarlier ? formatMoney(collected.earlier) : "–"}
							</span>
						</div>
					</div>
				</div>
				{unpaidOrders.length > 0 ? (
					<button
						className={cn(
							LINE,
							"w-full border-t px-3.5 py-2.5 text-left hover:bg-muted",
						)}
						onClick={() => onOpen("unpaid")}
						type="button"
					>
						<span>
							Unpaid
							<Badge className="ml-2 align-top tabular-nums" variant="outline">
								{unpaidOrders.length}
							</Badge>
							<span className="block text-footnote text-muted-foreground">
								{formatMoney(collected.amount + unpaidAmount)} once paid
							</span>
						</span>
						<span className="text-right font-medium text-tone-bad-foreground">
							{formatMoney(unpaidAmount)}
							<OpenArrow />
						</span>
					</button>
				) : null}
				{/* With no drop-offs the empty Sales Report says so; once is enough. */}
				{unpaidOrders.length === 0 && data.dropped_off.orders > 0 ? (
					<p className="border-t px-3.5 py-2.5 text-muted-foreground">
						Every Order dropped off {when} is paid.
					</p>
				) : null}
			</div>
		</Section>
	);
};
