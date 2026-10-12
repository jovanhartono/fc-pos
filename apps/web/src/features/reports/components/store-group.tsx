import { CaretRightIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
	numberFormatter,
	oneDecimalFormatter,
} from "@/features/reports/utils/format";
import type { WorkerTotals } from "@/features/reports/utils/workers-report";

interface StoreGroupProps {
	storeName: string;
	totals: WorkerTotals;
	chips?: ReactNode;
	// Initial state only; the owner's own open and close is never overridden.
	isOpenAtStart?: boolean;
	children: ReactNode;
}

// One closed row per Store, so the owner opens the branch they came for.
export const StoreGroup = ({
	storeName,
	totals,
	chips,
	isOpenAtStart = false,
	children,
}: StoreGroupProps) => (
	<details className="group border border-border" open={isOpenAtStart}>
		<summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
			<CaretRightIcon
				aria-hidden="true"
				className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90"
			/>
			<span className="font-medium">{storeName}</span>
			<span className="mr-auto text-muted-foreground tabular-nums">
				{`${numberFormatter.format(totals.people)} ${totals.people === 1 ? "person" : "people"} · `}
				<strong className="font-semibold text-foreground">
					{`${numberFormatter.format(totals.services)} ${totals.services === 1 ? "Service" : "Services"}`}
				</strong>
				{totals.perDayWorked !== null &&
					` · ${oneDecimalFormatter.format(totals.perDayWorked)}/day`}
			</span>
			<span className="flex gap-1.5">{chips}</span>
		</summary>
		<div className="border-border border-t max-lg:p-2">{children}</div>
	</details>
);
