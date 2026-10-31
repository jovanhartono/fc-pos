import type { TurnaroundReport } from "@/features/reports/api";
import { TURNAROUND_COLORS } from "@/features/reports/utils/palette";
import { longDuration } from "@/features/reports/utils/turnaround";

interface TurnaroundBreakdownProps {
	breakdown: TurnaroundReport["rows"][number]["breakdown"];
	minItems: number;
}

export const TurnaroundBreakdown = ({
	breakdown,
	minItems,
}: TurnaroundBreakdownProps) => {
	const {
		queued_p75: queued,
		in_progress_p75: inProgress,
		waiting_qc_p75: waitingQc,
	} = breakdown;
	const parts =
		queued === null || inProgress === null || waitingQc === null
			? null
			: [
					{ label: "Queued", hours: queued, color: TURNAROUND_COLORS.queued },
					{
						label: "In progress",
						hours: inProgress,
						color: TURNAROUND_COLORS.inProgress,
					},
					{
						label: "Waiting QC",
						hours: waitingQc,
						color: TURNAROUND_COLORS.waitingQc,
					},
				];
	const isAllZero = parts?.every((part) => part.hours === 0);
	return (
		<div className="grid gap-1.5 border-t px-3 pt-2.5 pb-3">
			<p className="text-subhead font-medium">
				Turnaround breakdown{" "}
				<span className="font-normal text-muted-foreground">
					· p75 per Service
				</span>
			</p>
			{parts === null ? (
				// Same height as the bar and its labels, so picking a thin
				// Category doesn't move the table below.
				<>
					<div className="h-2.5 bg-muted" />
					<span
						className="w-fit cursor-help text-subhead text-muted-foreground underline decoration-dotted underline-offset-2"
						title={`Needs ${minItems} Services in the range`}
					>
						Not enough data
					</span>
				</>
			) : (
				<>
					<div className="flex h-2.5">
						{parts.map((part) => (
							<span
								key={part.label}
								style={{
									flexGrow: isAllZero ? 1 : part.hours,
									backgroundColor: part.color,
								}}
							/>
						))}
					</div>
					<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-subhead">
						{parts.map((part) => (
							<span key={part.label} className="flex items-center gap-1.5">
								<span
									className="size-2"
									style={{ backgroundColor: part.color }}
								/>
								{part.label}
								<strong className="font-semibold tabular-nums">
									{longDuration(part.hours)}
								</strong>
							</span>
						))}
					</div>
				</>
			)}
		</div>
	);
};
