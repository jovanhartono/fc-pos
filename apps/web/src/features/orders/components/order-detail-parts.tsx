import type { ReactNode } from "react";

// Shared by the Order's cards and their skeletons, so a loading card is
// already the height of the loaded one.

export const CODE_HEADING =
	"break-all font-medium text-title-3 tracking-tight tabular-nums sm:text-title-2 compact:text-title-3";
export const META_LINE = "text-muted-foreground text-body compact:text-subhead";

export const ITEM_NAME =
	"text-pretty font-medium text-headline leading-5 compact:text-body";
export const ITEM_CODE =
	"break-all text-foreground text-subhead leading-snug tabular-nums";
export const SERVICE_LIST = "mx-4 mb-1 divide-y border-t";

export const STRIP_CLASS = "flex items-center gap-2 px-4 pb-3";
export const TILE_CLASS = "size-12 shrink-0 sm:size-20";
export const ADD_TILE_CLASS =
	"grid place-items-center rounded-sm border border-dashed border-border text-muted-foreground transition-colors hover:border-ring hover:text-foreground focus-visible:border-ring focus-visible:outline-none";

export const LINE_GRID =
	"grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 max-sm:items-start";
export const LINE_NAME = "text-body leading-5 compact:text-subhead";
export const LINE_BADGES =
	"flex flex-wrap items-center justify-end gap-1.5 max-sm:order-last max-sm:col-span-2 max-sm:justify-start";
export const LINE_HANDLER =
	"min-w-0 text-foreground text-subhead leading-snug max-sm:hidden";
export const LINE_PRICE =
	"flex items-center gap-1 justify-self-end text-body tabular-nums compact:text-subhead";

export const PAID_LIST = "grid gap-2 px-4 py-4 text-body compact:text-subhead";
export const PAID_ROW = "flex items-center justify-between gap-4";

export const TILE_GRID =
	"grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3 gap-y-4";

interface AttachmentLabelProps {
	children: string;
}

export const AttachmentLabel = ({ children }: AttachmentLabelProps) => (
	<p className="font-medium text-muted-foreground text-subhead">{children}</p>
);

interface TileCaptionProps {
	line1?: ReactNode;
	line2: ReactNode;
}

export const TileCaption = ({ line1, line2 }: TileCaptionProps) => (
	<div className="grid gap-0.5 text-subhead">
		{line1 ? <p className="font-medium tabular-nums">{line1}</p> : null}
		<div>{line2}</div>
	</div>
);
