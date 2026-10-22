import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { PaginationMeta } from "@/lib/http";
import { isListKeyBlocked } from "@/lib/list-keys";
import { PAGE_SIZES, type PageSize } from "@/lib/page-size";

type TablePaginationProps = {
	meta?: PaginationMeta;
	isLoading?: boolean;
	onPageChange: (page: number) => void;
	pageSize?: PageSize;
	onPageSizeChange?: (pageSize: PageSize) => void;
};

export function TablePagination({
	meta,
	isLoading,
	onPageChange,
	pageSize,
	onPageSizeChange,
}: TablePaginationProps) {
	const currentPage = meta ? Math.floor(meta.offset / meta.limit) + 1 : 1;
	const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;
	const canGoBack = !isLoading && meta !== undefined && currentPage > 1;
	const canGoForward =
		!isLoading && meta !== undefined && currentPage < totalPages;

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

	// Before the first page lands the pager is drawn disabled at its full height,
	// so it doesn't pop in under the rows.
	const range = meta
		? `${meta.total === 0 ? 0 : meta.offset + 1}-${Math.min(meta.offset + meta.limit, meta.total)} of ${meta.total}`
		: "–";

	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex items-center gap-3">
				<p className="text-muted-foreground text-footnote tabular-nums">
					<span className="max-sm:hidden">Showing </span>
					{range}
				</p>
				{pageSize && onPageSizeChange ? (
					<Select
						value={String(pageSize)}
						onValueChange={(value) =>
							onPageSizeChange(Number(value) as PageSize)
						}
					>
						<SelectTrigger
							size="sm"
							aria-label="Rows per page"
							className="tabular-nums"
						>
							<SelectValue>
								{(value: string) => (
									<>
										{value}
										<span className="max-sm:hidden">per page</span>
									</>
								)}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{PAGE_SIZES.map((size) => (
								<SelectItem key={size} value={String(size)}>
									{size} per page
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}
			</div>
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!canGoBack}
					icon={<HugeiconsIcon icon={ArrowLeft01Icon} />}
					onClick={() => onPageChange(currentPage - 1)}
				>
					Prev
				</Button>
				{/* A fixed box, so "–" becoming "Page 1 / 12" never moves the
				    buttons beside it. */}
				<span className="w-20 whitespace-nowrap text-center text-muted-foreground text-footnote tabular-nums max-sm:w-14">
					<span className="max-sm:hidden">Page </span>
					{meta ? `${currentPage} / ${totalPages}` : "–"}
				</span>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!canGoForward}
					icon={<HugeiconsIcon icon={ArrowRight01Icon} />}
					iconLocation="right"
					onClick={() => onPageChange(currentPage + 1)}
				>
					Next
				</Button>
			</div>
		</div>
	);
}
