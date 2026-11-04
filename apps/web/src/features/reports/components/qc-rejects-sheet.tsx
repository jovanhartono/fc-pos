import { CancelCircleIcon } from "@hugeicons/core-free-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { TablePagination } from "@/components/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { QC_REJECTS_PAGE_SIZE, reportsQueries } from "@/features/reports/api";
import {
	DETAIL_CLASS,
	ROW_CLASS,
	shortDay,
} from "@/features/reports/components/worker-sheet";
import { rangeLabel } from "@/features/reports/utils/format";
import { useLeaveSheetLink } from "@/hooks/useLeaveSheetLink";
import { useSheet } from "@/stores/sheet-store";

interface QcRejectsTarget {
	from: string;
	to: string;
	storeId?: number;
	checkerId?: number;
}

interface QcRejectsListProps {
	target: QcRejectsTarget;
}

export const QcRejectsList = ({ target }: QcRejectsListProps) => {
	const leaveSheet = useLeaveSheetLink();
	const [offset, setOffset] = useState(0);
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
			<ul className="rounded-lg border bg-card px-3">
				{items.map((item) => (
					<li key={item.id} className={ROW_CLASS}>
						<span className="text-muted-foreground tabular-nums">
							{shortDay(item.rejected_at)}
						</span>
						<Link
							to="/orders/$orderId"
							params={{ orderId: String(item.order_id) }}
							onClick={leaveSheet}
							className="text-link tabular-nums"
						>
							{item.item_code}
						</Link>
						<span className={DETAIL_CLASS}>
							{[
								item.service_name,
								item.reason,
								`cleaned by ${item.cleaned_by_name ?? "—"}`,
								// One checker's sheet already names who rejected it.
								target.checkerId === undefined &&
									`rejected by ${item.rejected_by_name}`,
							]
								.filter(Boolean)
								.join(" · ")}
						</span>
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
	return useCallback(
		(target: QcRejectsTarget) =>
			openSheet({
				title: "QC Rejects",
				description: rangeLabel(target.from, target.to),
				content: () => <QcRejectsList target={target} />,
			}),
		[openSheet],
	);
};
