import { CaretRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import {
	buildLineTimeline,
	type TimelineLine,
} from "@/features/orders/lib/line-timeline";

interface StatusTimelineProps {
	line: TimelineLine;
	orderId: number;
	defaultOpen?: boolean;
	// The order sheet closes itself before a link takes the cashier elsewhere.
	onNavigate?: () => void;
}

export const StatusTimeline = ({
	line,
	orderId,
	defaultOpen = false,
	onNavigate,
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
							{entry.reworkLineId === undefined ? (
								<p className="font-medium">{entry.label}</p>
							) : (
								<Link
									className="flex w-fit items-center gap-0.5 font-medium underline underline-offset-2 hover:text-muted-foreground"
									onClick={onNavigate}
									params={{ orderId, serviceId: entry.reworkLineId }}
									to="/queue/$orderId/$serviceId"
								>
									{entry.label}
									<CaretRightIcon aria-hidden="true" className="size-3" />
								</Link>
							)}
							{entry.at || entry.by ? (
								<p className="text-muted-foreground">
									{[entry.by, entry.at ? formatOrderDateTime(entry.at) : null]
										.filter(Boolean)
										.join(" · ")}
								</p>
							) : null}
							{entry.note ? (
								<p className="text-muted-foreground">{entry.note}</p>
							) : null}
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
