import type { CellData, RowData, TableFeatures } from "@tanstack/react-table";
import type { ReactNode } from "react";

type MobileCardSlot =
	| "title"
	| "title-end"
	| "subtitle"
	| "eyebrow"
	| "badges"
	// Sits at the right end of the card's last row, beside the details or badges.
	| "status"
	| "detail"
	| "footer"
	| "hidden";

interface MobileCardColumnOptions {
	slot?: MobileCardSlot;
	label?: ReactNode;
	// Most customers have no email; an empty "Email —" pair is just noise.
	omitWhenEmpty?: boolean;
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
		// On the table a long name wraps and long text is cut to one line.
		kind?: "code" | "name" | "text";
		// Extra classes for the desktop table th/td (e.g. sticky columns).
		headerClassName?: string;
		cellClassName?: string;
	}
}
