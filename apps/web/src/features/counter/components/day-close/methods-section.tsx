import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import type { DayClose } from "@/features/counter/api";
import {
	GroupLabel,
	LINE_ROW,
	LineName,
} from "@/features/counter/components/day-close/group-label";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import { AMOUNT_TONE } from "@/features/counter/components/day-close/order-row";
import { groupBySlip } from "@/features/counter/lib/day-close";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

interface MethodRowProps {
	amount: number;
	isLine: boolean;
	label: string;
	onClick: () => void;
	payments: number;
}

const MethodRow = ({
	amount,
	isLine,
	label,
	onClick,
	payments,
}: MethodRowProps) => {
	const name = (
		<>
			{label}
			<Badge className="ml-2 indent-0 align-top tabular-nums" variant="outline">
				{payments}
			</Badge>
		</>
	);
	return (
		<button
			className={cn(LINE_ROW, "hover:bg-muted", !isLine && "py-2.5")}
			onClick={onClick}
			type="button"
		>
			{isLine ? <LineName>{name}</LineName> : <span>{name}</span>}
			<span className={cn("text-right", AMOUNT_TONE.paid)}>
				{formatMoney(amount)}
				<OpenArrow />
			</span>
		</button>
	);
};

interface MethodsSectionProps {
	data: DayClose;
	onOpen: (list: string) => void;
}

export const MethodsSection = ({ data, onOpen }: MethodsSectionProps) => {
	const groups = groupBySlip(data.methods);

	return (
		<Section title="By payment method">
			<div className="overflow-hidden rounded-lg border bg-card">
				{groups.length === 0 ? (
					<p className="px-3 py-2.5">No payments this day.</p>
				) : null}
				{groups.map((group) => (
					<div
						className="border-border border-t first:border-t-0"
						key={group.slip}
					>
						{group.isSingle ? (
							<MethodRow
								amount={group.amount}
								isLine={false}
								label={group.slip}
								onClick={() => onOpen(`method:${group.slip}`)}
								payments={group.payments}
							/>
						) : (
							<>
								<GroupLabel
									end={
										<>
											{formatMoney(group.amount)}
											<OpenArrow />
										</>
									}
									onClick={() => onOpen(`method:${group.slip}`)}
									title={group.slip}
								/>
								{group.lines.map((line) => (
									<MethodRow
										amount={line.amount}
										isLine
										key={line.payment_method_id ?? "none"}
										label={line.line}
										onClick={() => onOpen(`method:${line.name}`)}
										payments={line.payments}
									/>
								))}
							</>
						)}
					</div>
				))}
			</div>
		</Section>
	);
};
