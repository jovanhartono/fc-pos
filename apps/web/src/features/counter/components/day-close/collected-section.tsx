import type { DayCloseCollected } from "@/features/counter/api";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";

interface CollectedSectionProps {
	collected: DayCloseCollected;
	isToday: boolean;
}

export const CollectedSection = ({
	collected,
	isToday,
}: CollectedSectionProps) => (
	<section className="grid gap-2.5 border border-border p-3.5">
		<div className="flex items-baseline justify-between gap-3">
			<span>Collected</span>
			<span className="font-medium text-[22px] tabular-nums">
				{formatMoney(collected.amount)}
			</span>
		</div>
		<p className="text-muted-foreground">
			{pluralize(collected.payments, "payment")}
			{isToday ? " so far" : ""}
		</p>
		<dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3.5 gap-y-1 border-border border-t pt-2.5 tabular-nums">
			<SplitRow
				label={isToday ? "Today's Orders" : "This day's Orders"}
				total={collected.this_day}
			/>
			<SplitRow label="Earlier Orders" total={collected.earlier} />
		</dl>
	</section>
);

interface SplitRowProps {
	label: string;
	total: DayCloseCollected["this_day"];
}

const SplitRow = ({ label, total }: SplitRowProps) => (
	<>
		<dt>{label}</dt>
		<dd className="min-w-[4.5ch] text-right text-muted-foreground">
			{total.payments}
		</dd>
		<dd className="text-right">{formatMoney(total.amount)}</dd>
	</>
);
