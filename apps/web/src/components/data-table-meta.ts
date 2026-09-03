import type { CellData, RowData, TableFeatures } from "@tanstack/react-table";

type MobileCardSlot =
	| "title"
	| "subtitle"
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
	interface ColumnMeta<
		in out TFeatures extends TableFeatures,
		in out TData extends RowData,
		TValue extends CellData = CellData,
	> {
		mobileCard?: MobileCardColumnOptions;
		// Extra classes for the desktop table th/td (e.g. sticky columns).
		headerClassName?: string;
		cellClassName?: string;
	}
}
