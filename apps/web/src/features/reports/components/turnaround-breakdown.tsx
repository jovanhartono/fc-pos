import type { TurnaroundReport } from "@/features/reports/api";
import { TURNAROUND_COLORS } from "@/features/reports/utils/palette";
import { longDuration, queuedShare } from "@/features/reports/utils/turnaround";

interface TurnaroundBreakdownProps {
	breakdown: TurnaroundReport["rows"][number]["breakdown"];
	minItems: number;
}

export const TurnaroundBreakdown = ({
	breakdown,
	minItems,
}: TurnaroundBreakdownProps) => {
	const { queued_p75: queued, in_progress_p75: inProgress } = breakdown;
	return (
		<div className="grid gap-1.5 border-t px-3 pt-2.5 pb-3">
			<p className="text-subhead font-medium">
				Turnaround breakdown{" "}
				<span className="font-normal text-muted-foreground">
					· p75 per Service
				</span>
			</p>
			{queued === null || inProgress === null ? (
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
						<span
							style={{
								width: `${queuedShare(queued, inProgress)}%`,
								backgroundColor: TURNAROUND_COLORS.queued,
							}}
						/>
						<span
							className="flex-1"
							style={{ backgroundColor: TURNAROUND_COLORS.inProgress }}
						/>
					</div>
					<div className="flex justify-between gap-3 text-subhead">
						<span className="flex items-center gap-1.5">
							<span
								className="size-2"
								style={{ backgroundColor: TURNAROUND_COLORS.queued }}
							/>
							Queued
							<strong className="font-semibold tabular-nums">
								{longDuration(queued)}
							</strong>
						</span>
						<span className="flex items-center gap-1.5">
							In progress
							<strong className="font-semibold tabular-nums">
								{longDuration(inProgress)}
							</strong>
							<span
								className="size-2"
								style={{ backgroundColor: TURNAROUND_COLORS.inProgress }}
							/>
						</span>
					</div>
				</>
			)}
		</div>
	);
};
