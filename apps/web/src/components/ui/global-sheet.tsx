import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useSheet } from "@/stores/sheet-store";

export function GlobalSheet() {
	const { open, title, description, content, size, back, actions, onClose } =
		useSheet((state) => state.sheetState);
	const closeSheet = useSheet((state) => state.closeSheet);
	const clearClosedSheet = useSheet((state) => state.clearClosedSheet);
	const isDirty = useSheet((state) => state.isDirty);
	const [confirmOpen, setConfirmOpen] = useState(false);
	// A plain title with nothing under it; an Order's own title is hidden, and
	// an Item opened from a worker's sheet keeps its two lines.
	const titleInBackRow =
		Boolean(back) && typeof title === "string" && !description && !actions;

	const dismiss = () => {
		onClose?.();
		closeSheet();
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			return;
		}
		if (isDirty) {
			setConfirmOpen(true);
			return;
		}
		dismiss();
	};

	const handleDiscard = () => {
		setConfirmOpen(false);
		dismiss();
	};

	return (
		<>
			<Sheet
				open={open}
				onOpenChange={handleOpenChange}
				onOpenChangeComplete={(isOpen) => {
					if (!isOpen) {
						clearClosedSheet();
					}
				}}
			>
				<SheetContent
					side="right"
					className={cn(
						"w-full overflow-hidden",
						size === "wide" &&
							"data-[side=right]:w-full data-[side=right]:sm:max-w-[820px]",
					)}
				>
					{title || description ? (
						<SheetHeader className="shrink-0 border-b">
							{/* O12: one row for both, so a sheet opened over another (an Order,
							    Collect payment) keeps the header height and its body starts where
							    the one below did; mb-0.5 stands in for the Order's hidden title. */}
							{back || actions ? (
								<div
									className={cn(
										"flex items-center gap-2 pr-8",
										titleInBackRow && "mb-0.5",
									)}
								>
									{back ? (
										<button
											type="button"
											onClick={back.onClick}
											className="-my-1.5 -ml-1 flex h-9 shrink-0 items-center gap-0.5 text-left text-body text-link hover:opacity-80 pointer-coarse:h-11"
										>
											<HugeiconsIcon
												icon={ArrowLeft01Icon}
												className="size-4.5 shrink-0"
											/>
											{back.label}
										</button>
									) : null}
									{titleInBackRow ? (
										<>
											<span
												aria-hidden
												className="shrink-0 text-muted-foreground"
											>
												·
											</span>
											<SheetTitle className="min-w-0 truncate">
												{title}
											</SheetTitle>
										</>
									) : null}
									{actions ? (
										<div className="min-w-0 flex-1">{actions}</div>
									) : null}
								</div>
							) : null}
							{title && !titleInBackRow ? (
								<SheetTitle>{title}</SheetTitle>
							) : null}
							<SheetDescription
								className={cn({
									"sr-only": !description,
								})}
							>
								{description || title}
							</SheetDescription>
						</SheetHeader>
					) : null}
					<div className="min-h-0 flex-1 overflow-y-auto p-4">
						{content ? content() : null}
					</div>
				</SheetContent>
			</Sheet>
			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent
					showCloseButton={false}
					className="max-w-[320px] gap-4 rounded-2xl px-4.5 pt-5 pb-4 text-center sm:max-w-[320px]"
				>
					<DialogHeader className="text-balance text-center">
						<DialogTitle>Discard unsaved changes?</DialogTitle>
						<DialogDescription className="text-subhead">
							You have unsaved edits. Closing will lose them.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="grid grid-cols-2 gap-2 *:w-full pointer-fine:*:h-10">
						<Button
							type="button"
							variant="outline"
							onClick={() => setConfirmOpen(false)}
						>
							Keep editing
						</Button>
						<Button type="button" variant="destructive" onClick={handleDiscard}>
							Discard
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
