import { CancelCircleIcon } from "@hugeicons/core-free-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { MessageRowContent, ROW_TAP, RowLabel } from "@/components/message-row";
import { TablePagination } from "@/components/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { QC_REJECTS_PAGE_SIZE, reportsQueries } from "@/features/reports/api";
import { useOpenLineSheet } from "@/features/reports/components/worker-sheet";
import { rangeLabel } from "@/features/reports/utils/format";
import { formatDay } from "@/lib/dayjs";
import { getItemName } from "@/lib/order-service-item-details";
import { useSheet } from "@/stores/sheet-store";

interface QcRejectsTarget {
	from: string;
	to: string;
	storeId?: number;
	checkerId?: number;
}

interface QcRejectsListProps {
	target: QcRejectsTarget;
	// Where the line's sheet goes back to: this list's own sheet, on the page
	// the admin left it.
	back: { label: string; onClick: (offset: number) => void };
	initialOffset?: number;
}

export const QcRejectsList = ({
	target,
	back,
	initialOffset = 0,
}: QcRejectsListProps) => {
	const openLineSheet = useOpenLineSheet();
	const [offset, setOffset] = useState(initialOffset);
	const query = useQuery({
		...reportsQueries.qcRejects({
			from: target.from,
			to: target.to,
			store_id: target.storeId,
			checker_id: target.checkerId,
			limit: QC_REJECTS_PAGE_SIZE,
			offset,
		}),
		placeholderData: keepPreviousData,
	});
	if (query.isPending) {
		return <Skeleton className="h-24 w-full rounded-lg" />;
	}
	const items = query.data?.items ?? [];
	if (items.length === 0) {
		return (
			<EmptyState icon={CancelCircleIcon}>No QC rejects in range.</EmptyState>
		);
	}
	return (
		<div className="grid gap-3">
			<ul className="divide-y rounded-lg border bg-card px-3">
				{items.map((item) => (
					<li key={item.id}>
						<button
							type="button"
							className={ROW_TAP}
							onClick={() =>
								openLineSheet(item, {
									label: back.label,
									onClick: () => back.onClick(offset),
								})
							}
						>
							<MessageRowContent
								item={getItemName(item)}
								date={formatDay(item.rejected_at)}
								details={[
									item.service_name,
									<RowLabel key="cleaned" label="cleaned by">
										{item.cleaned_by_name ?? "—"}
									</RowLabel>,
									// One checker's sheet already names who rejected it.
									target.checkerId === undefined ? (
										<RowLabel key="rejected" label="rejected by">
											{item.rejected_by_name}
										</RowLabel>
									) : null,
								]}
								text={item.reason}
							/>
						</button>
					</li>
				))}
			</ul>
			{(query.data?.meta.total ?? 0) > QC_REJECTS_PAGE_SIZE && (
				<TablePagination
					meta={query.data?.meta}
					isLoading={query.isFetching}
					onPageChange={(page) => setOffset((page - 1) * QC_REJECTS_PAGE_SIZE)}
				/>
			)}
		</div>
	);
};

export const useOpenQcRejectsSheet = () => {
	const openSheet = useSheet((s) => s.openSheet);
	const open = (target: QcRejectsTarget, offset = 0) =>
		openSheet({
			title: "QC Rejects",
			description: rangeLabel(target.from, target.to),
			content: () => (
				<QcRejectsList
					target={target}
					initialOffset={offset}
					back={{
						label: "QC Rejects",
						onClick: (next) => open(target, next),
					}}
				/>
			),
		});
	return open;
};
