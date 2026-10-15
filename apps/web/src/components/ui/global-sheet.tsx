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
	const { open, title, description, content, size, back, onClose } = useSheet(
		(state) => state.sheetState,
	);
	const closeSheet = useSheet((state) => state.closeSheet);
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
			<Sheet open={open} onOpenChange={handleOpenChange}>
				<SheetContent
					side="right"
					className={cn(
						"w-full overflow-y-auto",
						size === "wide" && "data-[side=right]:sm:max-w-[820px]",
					)}
				>
					{title || description ? (
						<SheetHeader>
							{back ? (
								<button
									type="button"
									onClick={back.onClick}
									className="justify-self-start text-left text-muted-foreground text-sm hover:text-foreground"
								>
									{`← ${back.label}`}
								</button>
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
					<div className="p-4">{content ? content() : null}</div>
				</SheetContent>
			</Sheet>
			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent showCloseButton={false} className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Discard unsaved changes?</DialogTitle>
						<DialogDescription>
							You have unsaved edits. Closing will lose them.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
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
