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

	return (
		<Sheet
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					closeSheet();
				}
			}}
		>
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
				<div className="p-4">{content}</div>
			</SheetContent>
		</Sheet>
	);
}
