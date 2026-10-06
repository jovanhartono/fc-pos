import { CaretRightIcon } from "@phosphor-icons/react";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import {
	buildLineTimeline,
	type TimelineLine,
} from "@/features/orders/lib/line-timeline";

interface StatusTimelineProps {
	line: TimelineLine;
	defaultOpen?: boolean;
}

export const StatusTimeline = ({
	line,
	defaultOpen = false,
}: StatusTimelineProps) => {
	const entries = buildLineTimeline(line);

	return (
		<details className="group" open={defaultOpen}>
			<summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden [&::marker]:hidden">
				<CaretRightIcon
					className="size-4 shrink-0 transition-transform group-open:rotate-90"
					aria-hidden="true"
				/>
				Timeline ({entries.length})
			</summary>
			<div className="mt-3 grid gap-2 border-l border-border pl-3">
				{entries.length > 0 ? (
					entries.map((entry) => (
						<div key={entry.key} className="grid gap-1 text-xs">
							<p className="font-medium">{entry.label}</p>
							{(entry.at !== null || entry.by !== null) && (
								<p className="text-muted-foreground">
									{[entry.by, entry.at ? formatOrderDateTime(entry.at) : null]
										.filter(Boolean)
										.join(" · ")}
								</p>
							)}
							{Boolean(entry.note) && (
								<p className="text-muted-foreground">{entry.note}</p>
							)}
						</div>
					))
				) : (
					<p className="text-xs text-muted-foreground">
						No status updates yet.
					</p>
				)}
			</div>
		</details>
	);
};
