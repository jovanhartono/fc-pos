import type { DayClose } from "@/features/counter/api";
import { CountBadge } from "@/features/counter/components/day-close/count-badge";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import { AMOUNT_TONE } from "@/features/counter/components/day-close/order-row";
import { groupBySlip } from "@/features/counter/lib/day-close";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

const ROW =
	"grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3.5 px-3 py-2.5 text-left tabular-nums hover:bg-muted";

const ROW_KIND = {
	plain: "",
	// A slip with lines matches the terminal's settlement slip, so it is the
	// only shaded row; its lines hang off a rule underneath.
	slip: "bg-muted/70 font-medium",
	line: "ml-4 w-[calc(100%-1rem)] border-border border-l-2 py-1.5 pl-3.5 text-sm",
};

interface MethodRowProps {
	amount: number;
	kind: keyof typeof ROW_KIND;
	label: string;
	onClick: () => void;
	payments: number;
}

const MethodRow = ({
	amount,
	kind,
	label,
	onClick,
	payments,
}: MethodRowProps) => (
	<button className={cn(ROW, ROW_KIND[kind])} onClick={onClick} type="button">
		<span>
			{label}
			<CountBadge count={payments} />
		</span>
		<span className={cn("text-right", AMOUNT_TONE.paid)}>
			{formatMoney(amount)}
			<OpenArrow />
		</span>
	</button>
);

interface MethodsSectionProps {
	data: DayClose;
	onOpen: (list: string) => void;
}

export const MethodsSection = ({ data, onOpen }: MethodsSectionProps) => {
	const groups = groupBySlip(data.methods);

	return (
		<section className="grid gap-2.5">
			<h2 className="font-medium text-base">By PaymentMethod</h2>
			<div className="border border-border">
				{groups.length === 0 ? (
					<p className="px-3 py-2.5">No payments this day.</p>
				) : null}
				{groups.map((group) => (
					<div
						className="border-border border-t first:border-t-0"
						key={group.slip}
					>
						<MethodRow
							amount={group.amount}
							kind={group.isSingle ? "plain" : "slip"}
							label={group.slip}
							onClick={() => onOpen(`method:${group.slip}`)}
							payments={group.payments}
						/>
						{group.isSingle
							? null
							: group.lines.map((line) => (
									<MethodRow
										amount={line.amount}
										kind="line"
										key={line.payment_method_id ?? "none"}
										label={line.line}
										onClick={() => onOpen(`method:${line.name}`)}
										payments={line.payments}
									/>
								))}
					</div>
				))}
			</div>
		</section>
	);
};
