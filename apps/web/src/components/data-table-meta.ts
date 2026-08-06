import type { RowData } from "@tanstack/react-table";

type MobileCardSlot =
	| "title"
	| "eyebrow"
	| "badges"
	| "detail"
	| "footer"
	| "hidden";

interface MobileCardColumnOptions {
	slot?: MobileCardSlot;
	label?: string;
	className?: string;
	labelClassName?: string;
	valueClassName?: string;
}

declare module "@tanstack/react-table" {
	interface ColumnMeta<TData extends RowData, TValue> {
		mobileCard?: MobileCardColumnOptions;
		// Extra classes for the desktop table th/td (e.g. sticky columns).
		headerClassName?: string;
		cellClassName?: string;
	}
}
