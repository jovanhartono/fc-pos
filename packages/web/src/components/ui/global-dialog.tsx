import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDialog } from "@/stores/dialog-store";

export function GlobalDialog() {
	const { open, title, description, content, footer } = useDialog(
		(state) => state.dialogState,
	);
	const closeDialog = useDialog((state) => state.closeDialog);

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					closeDialog();
				}
			}}
		>
			<DialogContent>
				{title || description ? (
					<DialogHeader>
						{title ? <DialogTitle>{title}</DialogTitle> : null}
						<DialogDescription
							className={cn({
								"sr-only": !description,
							})}
						>
							{description || title}
						</DialogDescription>
					</DialogHeader>
				) : null}
				{content ? <div className="py-4">{content()}</div> : null}
				{footer ? <DialogFooter>{footer()}</DialogFooter> : null}
			</DialogContent>
		</Dialog>
	);
}
