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
	const { open, title, description, content, footer, contentClassName } =
		useDialog((state) => state.dialogState);
	const closeDialog = useDialog((state) => state.closeDialog);
	const isConfirm = !content;

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					closeDialog();
				}
			}}
		>
			<DialogContent
				showCloseButton={!isConfirm}
				className={cn(
					isConfirm &&
						"max-w-[320px] gap-4 rounded-2xl px-4.5 pt-5 pb-4 text-center sm:max-w-[320px]",
					contentClassName,
				)}
			>
				{title || description ? (
					<DialogHeader className={cn(isConfirm && "text-balance text-center")}>
						{title ? <DialogTitle>{title}</DialogTitle> : null}
						<DialogDescription
							className={cn({
								"text-subhead": isConfirm,
								"sr-only": !description,
							})}
						>
							{description || title}
						</DialogDescription>
					</DialogHeader>
				) : null}
				{content ? <div className="py-4">{content()}</div> : null}
				{footer ? (
					<DialogFooter
						className={cn(
							isConfirm &&
								"grid grid-cols-2 gap-2 *:w-full pointer-fine:*:h-10",
						)}
					>
						{footer()}
					</DialogFooter>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
