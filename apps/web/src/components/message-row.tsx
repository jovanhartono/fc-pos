import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, type ReactNode } from "react";

// A row that opens something. The hover fill reaches past the text, so the
// text still lines up with the heading above the list.
export const ROW_TAP =
	"-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none";
// A Complaint and its Reworks step in under the line they belong to.
export const ROW_TAP_NESTED = "pt-1 pl-7";
export const ROW_TITLE = "text-body leading-5 compact:text-subhead";

export const RowChevron = () => (
	<HugeiconsIcon
		icon={ArrowRight01Icon}
		aria-hidden="true"
		className="size-3.5 shrink-0 text-muted-foreground/50"
	/>
);

interface RowLabelProps {
	label: string;
	children: ReactNode;
}

// "rejected by Sari": the role is a label, the name is content.
export const RowLabel = ({ label, children }: RowLabelProps) => (
	<span className="whitespace-nowrap">
		<span className="text-muted-foreground">{label}</span> {children}
	</span>
);

interface MessageRowContentProps {
	// The shoe as cashiers remember it. Left out inside the Item card, which
	// already names it.
	item?: string;
	date: string;
	// "Complaint #7", in red.
	lead?: string;
	details?: ReactNode[];
	badge?: ReactNode;
	text: string | null;
}

// One Complaint or QC reject. The badge takes the top right like a line's
// status, so a red "Complaint #N" never shares a line with a red Refunded.
export const MessageRowContent = ({
	item,
	date,
	lead,
	details = [],
	badge,
	text,
}: MessageRowContentProps) => {
	const what = (
		<>
			{lead ? <span className="text-destructive">{lead}</span> : null}
			{details.filter(Boolean).map((detail, index) => (
				<Fragment key={index}>
					{lead || index > 0 ? " · " : null}
					{detail}
				</Fragment>
			))}
		</>
	);
	const dateCell = (
		<span className="justify-self-end text-subhead tabular-nums">{date}</span>
	);

	return (
		<>
			<span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
				{item ? (
					<>
						<span className={ROW_TITLE}>{item}</span>
						{badge ? (
							<span className="justify-self-end">{badge}</span>
						) : (
							dateCell
						)}
						<span className="text-subhead">{what}</span>
						{badge ? dateCell : null}
					</>
				) : (
					<>
						<span className={ROW_TITLE}>{what}</span>
						{dateCell}
					</>
				)}
				<span className="col-span-2 line-clamp-2 text-pretty text-subhead">
					{text?.trim() || (
						<span className="text-muted-foreground">No note</span>
					)}
				</span>
			</span>
			<RowChevron />
		</>
	);
};
