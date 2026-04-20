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
	const { open, title, description, content } = useSheet(
		(state) => state.sheetState,
	);
	const closeSheet = useSheet((state) => state.closeSheet);
	const isDirty = useSheet((state) => state.isDirty);
	const [confirmOpen, setConfirmOpen] = useState(false);

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			return;
		}
		if (isDirty) {
			setConfirmOpen(true);
			return;
		}
		closeSheet();
	};

	const handleDiscard = () => {
		setConfirmOpen(false);
		closeSheet();
	};

	return (
		<>
			<Sheet open={open} onOpenChange={handleOpenChange}>
				<SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
					{title || description ? (
						<SheetHeader>
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
