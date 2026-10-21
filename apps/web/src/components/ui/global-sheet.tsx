import { CaretLeftIcon } from "@phosphor-icons/react";
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
							{/* O12: one row for both, so an Order opened over another sheet
							    keeps the same header height as one opened from the list. */}
							{back || actions ? (
								<div className="flex items-center gap-2 pr-8">
									{back ? (
										<button
											type="button"
											onClick={back.onClick}
											className="-my-1.5 -ml-1 flex h-9 shrink-0 items-center gap-0.5 text-left text-body text-link hover:opacity-80 pointer-coarse:h-11"
										>
											<CaretLeftIcon className="size-4.5 shrink-0" />
											{back.label}
										</button>
									) : null}
									{actions ? (
										<div className="min-w-0 flex-1">{actions}</div>
									) : null}
								</div>
							) : null}
							{title ? <SheetTitle>{title}</SheetTitle> : null}
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
