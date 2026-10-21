import {
	CHIP_CLASS,
	CHIP_STRIP_ROW,
	ChipStripScroller,
} from "@/components/chip-strip";
import { StickyControls } from "@/components/sticky-controls";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CHIP_WIDTHS = ["w-11", "w-22", "w-26", "w-20", "w-19", "w-28"];
const TILE_COUNT = 12;

// The POS as it opens: store and search rows, the category chips, then the
// catalog tiles, so the cashier sees the counter's layout while it loads.
export const PosSkeleton = () => (
	<div aria-hidden className="grid gap-5">
		<StickyControls className="grid gap-3">
			<div className="flex gap-2">
				<Skeleton className="h-9 flex-1 rounded-sm pointer-coarse:h-11" />
				<Skeleton className="h-9 w-23 rounded-sm pointer-coarse:h-11" />
			</div>
			<Skeleton className="h-9 rounded-sm pointer-coarse:h-11" />
			<ChipStripScroller>
				<div className={CHIP_STRIP_ROW}>
					{CHIP_WIDTHS.map((width) => (
						<Skeleton className={cn(CHIP_CLASS, width)} key={width} />
					))}
				</div>
			</ChipStripScroller>
		</StickyControls>
		{/* The tile grid's own classes, so each placeholder sits where a tile lands. */}
		<div className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
			{Array.from({ length: TILE_COUNT }, (_, index) => (
				<Card
					className="py-0 max-sm:rounded-none max-sm:border-0 max-sm:border-b max-sm:last:border-b-0 sm:border-border/70"
					key={index}
				>
					<div className="flex min-h-14 items-center gap-3 p-3 sm:flex-col sm:items-stretch sm:gap-1.5">
						<Skeleton className="my-0.5 hidden h-3 w-1/3 sm:block" />
						<Skeleton className="my-0.75 h-3.5 flex-1 sm:w-2/3 sm:flex-initial" />
						<div className="flex shrink-0 items-center justify-between sm:pt-1">
							<Skeleton className="my-0.75 h-3.5 w-20" />
							<Skeleton className="size-7 rounded-full max-sm:hidden" />
						</div>
					</div>
				</Card>
			))}
		</div>
	</div>
);
