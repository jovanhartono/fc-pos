import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createLink } from "@tanstack/react-router";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

const ROW =
	"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-4 py-2.5 transition-colors hover:bg-muted/50";

interface OrderListRowAnchorProps
	extends Omit<ComponentPropsWithRef<"a">, "title"> {
	action?: ReactNode;
	badges?: ReactNode;
	details: (string | null | undefined)[];
	end?: ReactNode;
	// The phone Orders list needs the caret's width for the code and badges.
	hasCaret?: boolean;
	isActive?: boolean;
	// Shown in full under the code line: workers find a Complaint by the Item's name.
	note?: string | null;
	title: string;
}

const OrderListRowAnchor = ({
	action,
	badges,
	className,
	details,
	end,
	hasCaret = true,
	isActive,
	note,
	title,
	...anchorProps
}: OrderListRowAnchorProps) => {
	const body = (
		<div className="grid min-w-0 gap-1">
			<div className="flex min-w-0 items-center gap-2">
				<p className="truncate font-medium text-foreground text-body">
					{title}
				</p>
				{badges}
			</div>
			<p className="truncate text-foreground text-subhead tabular-nums">
				{details.filter(Boolean).join(" · ")}
			</p>
			{Boolean(note) && (
				<p className="break-words text-foreground text-subhead">{note}</p>
			)}
		</div>
	);
	const caret = hasCaret ? (
		<HugeiconsIcon
			icon={ArrowRight01Icon}
			aria-hidden="true"
			className="size-3.5 shrink-0 text-muted-foreground/50"
		/>
	) : null;

	if (action === undefined) {
		return (
			<a
				{...anchorProps}
				className={cn(
					ROW,
					"outline-none focus-visible:bg-muted",
					isActive && "bg-primary/10 hover:bg-primary/10",
					className,
				)}
			>
				{body}
				<div className="flex items-center gap-3">
					{end}
					{caret}
				</div>
			</a>
		);
	}

	// A button may not sit inside a link, so the link covers the row and the
	// Notify button sits above it: a cashier can tap either.
	return (
		<div
			className={cn(
				ROW,
				"relative has-[a:focus-visible]:bg-muted",
				isActive && "bg-primary/10 hover:bg-primary/10",
				className,
			)}
		>
			<a {...anchorProps} className="absolute inset-0 rounded-md outline-none">
				<span className="sr-only">{title}</span>
			</a>
			{body}
			<div className="flex items-center gap-3">
				{end}
				<div className="relative">{action}</div>
				{caret}
			</div>
		</div>
	);
};

// The Ready for pickup row, shared by every list of Orders that is not a table.
export const OrderListRow = createLink(OrderListRowAnchor);
