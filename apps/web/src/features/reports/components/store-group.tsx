import { CaretRightIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { BadCount } from "@/features/reports/components/tone-chip";
import {
	numberFormatter,
	oneDecimalFormatter,
} from "@/features/reports/utils/format";
import type { WorkerTotals } from "@/features/reports/utils/workers-report";

interface StoreGroupProps {
	storeName: string;
	totals: WorkerTotals;
	// Initial state only; the owner's own open and close is never overridden.
	isOpenAtStart?: boolean;
	children: ReactNode;
}

// One closed row per Store, so the owner opens the branch they came for.
export const StoreGroup = ({
	storeName,
	totals,
	isOpenAtStart = false,
	children,
}: StoreGroupProps) => (
	<details
		className="group overflow-hidden rounded-lg border bg-card"
		open={isOpenAtStart}
	>
		<summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-body [&::-webkit-details-marker]:hidden">
			<CaretRightIcon
				aria-hidden="true"
				className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90"
			/>
			<span className="font-medium">{storeName}</span>
			<span className="mr-auto text-muted-foreground tabular-nums">
				{`${numberFormatter.format(totals.people)} ${totals.people === 1 ? "person" : "people"} · `}
				<span className="font-medium text-foreground">
					{`${numberFormatter.format(totals.services)} ${totals.services === 1 ? "Service" : "Services"}`}
				</span>
				{totals.perDayWorked !== null &&
					` · ${oneDecimalFormatter.format(totals.perDayWorked)}/day`}
			</span>
			<span className="flex gap-4 text-muted-foreground tabular-nums">
				<span>
					QC rejects{" "}
					<BadCount
						bad={totals.qcRejects}
						total={totals.qcChecks}
						zeroClassName="text-tone-good-foreground"
					/>
				</span>
				<span>
					Complaints{" "}
					<BadCount
						bad={totals.complaints}
						total={totals.complaintCohort}
						zeroClassName="text-tone-good-foreground"
					/>
				</span>
			</span>
		</summary>
		<div className="border-border border-t">{children}</div>
	</details>
);
