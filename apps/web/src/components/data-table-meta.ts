import type { CellData, RowData, TableFeatures } from "@tanstack/react-table";

type MobileCardSlot =
	| "title"
	| "title-end"
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
		// Money columns sit on the right so the thousands line up row to row.
		align?: "right";
		// A code cell is mono, a name cell medium weight, on the table and the card.
		kind?: "code" | "name";
		// Extra classes for the desktop table th/td (e.g. sticky columns).
		headerClassName?: string;
		cellClassName?: string;
	}
}
