import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { PaginationMeta } from "@/lib/api";

type TablePaginationProps = {
	meta?: PaginationMeta;
	isLoading?: boolean;
	onPageChange: (page: number) => void;
};

export function TablePagination({
	meta,
	isLoading,
	onPageChange,
}: TablePaginationProps) {
	if (!meta) {
		return null;
	}

	const currentPage = Math.floor(meta.offset / meta.limit) + 1;
	const totalPages = Math.max(1, Math.ceil(meta.total / meta.limit));
	const from = meta.total === 0 ? 0 : meta.offset + 1;
	const to = Math.min(meta.offset + meta.limit, meta.total);

	return (
		<div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
			<p className="text-xs text-muted-foreground">
				{`Showing ${from}-${to} of ${meta.total}`}
			</p>
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={isLoading || currentPage <= 1}
					icon={<CaretLeftIcon className="size-4" />}
					onClick={() => onPageChange(currentPage - 1)}
				>
					Prev
				</Button>
				<span className="min-w-20 text-center text-xs text-muted-foreground">
					{`Page ${currentPage} / ${totalPages}`}
				</span>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={isLoading || currentPage >= totalPages}
					icon={<CaretRightIcon className="size-4" />}
					iconLocation="right"
					onClick={() => onPageChange(currentPage + 1)}
				>
					Next
				</Button>
			</div>
		</div>
	);
}
