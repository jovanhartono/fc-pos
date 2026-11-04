import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactElement, type ReactNode, useState } from "react";
import { FilterCountBadge } from "@/components/filter-count-badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { useIsCoarsePointer } from "@/hooks/use-mobile";

interface FilterPanelProps<T> {
	// The filters the list shows now.
	value: T;
	// Filters set in a value; tabs on screen don't count.
	countOf: (value: T) => number;
	clear: (value: T) => T;
	onApply: (value: T) => void;
	// Replaces the icon button, for a page whose button spells out its filters.
	trigger?: ReactElement;
	children: (draft: T, setDraft: (patch: Partial<T>) => void) => ReactNode;
}

// One Filters panel for every list: a dialog with a mouse, a bottom sheet on
// touch, where the date pickers open their own sheets on top. Picks wait for
// Apply, so the list behind loads once, not on every tap; closing drops them.
export const FilterPanel = <T,>({
	value,
	countOf,
	clear,
	onApply,
	trigger,
	children,
}: FilterPanelProps<T>) => {
	const isCoarsePointer = useIsCoarsePointer();
	const [isOpen, setIsOpen] = useState(false);
	const [draft, setDraft] = useState(value);

	const handleOpenChange = (open: boolean) => {
		if (open) {
			setDraft(value);
		}
		setIsOpen(open);
	};
	const patchDraft = (patch: Partial<T>) =>
		setDraft((current) => ({ ...current, ...patch }));

	const count = countOf(value);
	const triggerElement = trigger ?? (
		<Button
			aria-label="Filters"
			type="button"
			variant="outline"
			size="icon"
			className="relative"
			icon={<HugeiconsIcon icon={FilterIcon} className="size-4" />}
		>
			{count > 0 ? <FilterCountBadge count={count} /> : null}
		</Button>
	);

	const footer = (
		<div className="flex gap-2">
			<Button
				type="button"
				variant="outline"
				className="flex-1"
				disabled={countOf(draft) === 0}
				onClick={() => setDraft(clear(draft))}
			>
				Clear All
			</Button>
			<Button
				type="button"
				className="flex-1"
				onClick={() => {
					onApply(draft);
					setIsOpen(false);
				}}
			>
				Apply
			</Button>
		</div>
	);
	const body = children(draft, patchDraft);

	if (isCoarsePointer) {
		return (
			<Sheet open={isOpen} onOpenChange={handleOpenChange} side="bottom">
				<SheetTrigger render={triggerElement} />
				<SheetContent className="max-h-[88svh] gap-0">
					<SheetHeader className="shrink-0 border-b px-4 py-3">
						<SheetTitle>Filters</SheetTitle>
					</SheetHeader>
					<div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
					<SheetFooter className="shrink-0 border-t border-border/70 p-3">
						{footer}
					</SheetFooter>
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogTrigger render={triggerElement} />
			<DialogContent className="max-w-[calc(100%-1.5rem)] gap-4 p-4 sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Filters</DialogTitle>
				</DialogHeader>
				{body}
				<div className="border-border/70 border-t pt-4">{footer}</div>
			</DialogContent>
		</Dialog>
	);
};
