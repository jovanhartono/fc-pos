import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { PaginationMeta } from "@/lib/http";
import { isListKeyBlocked } from "@/lib/list-keys";

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
	const currentPage = meta ? Math.floor(meta.offset / meta.limit) + 1 : 1;
	const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;
	const canGoBack = !isLoading && currentPage > 1;
	const canGoForward = !isLoading && currentPage < totalPages;

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (isListKeyBlocked(event)) {
				return;
			}
			if (event.key === "[" && canGoBack) {
				onPageChange(currentPage - 1);
			}
			if (event.key === "]" && canGoForward) {
				onPageChange(currentPage + 1);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [canGoBack, canGoForward, currentPage, onPageChange]);

	if (!meta) {
		return null;
	}

	const from = meta.total === 0 ? 0 : meta.offset + 1;
	const to = Math.min(meta.offset + meta.limit, meta.total);

	return (
		<div className="flex items-center justify-between gap-3">
			<p className="text-muted-foreground text-xs tabular-nums">
				<span className="max-sm:hidden">Showing </span>
				{`${from}-${to} of ${meta.total}`}
			</p>
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!canGoBack}
					icon={<CaretLeftIcon className="size-4" />}
					onClick={() => onPageChange(currentPage - 1)}
				>
					Prev
				</Button>
				<span className="min-w-16 text-center text-muted-foreground text-xs tabular-nums">
					<span className="max-sm:hidden">Page </span>
					{`${currentPage} / ${totalPages}`}
				</span>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!canGoForward}
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
