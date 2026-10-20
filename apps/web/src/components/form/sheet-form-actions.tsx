import { Button } from "@/components/ui/button";

// Short values sit in pairs (Name | SKU, COGS | Price) instead of each taking a
// full-width row; a field that needs the room says col-span-full.
export const SHEET_FORM_GRID =
	"grid grid-cols-1 gap-x-3 min-[390px]:grid-cols-2";

interface SheetFormActionsProps {
	isEditing: boolean;
	isSubmitting: boolean;
	onCancel: () => void;
	// The submit label when creating, e.g. "Add campaign"; an edit always says Save.
	addLabel: string;
}

// Pinned to the bottom of the sheet like its header, so Save is in reach at the
// top of an eleven-field Campaign form without scrolling for it.
export const SheetFormActions = ({
	isEditing,
	isSubmitting,
	onCancel,
	addLabel,
}: SheetFormActionsProps) => {
	const submitLabel = isEditing ? "Save" : addLabel;
	return (
		<div className="sticky -bottom-4 z-10 col-span-full -mx-4 -mb-4 flex justify-end gap-2 border-t bg-popover px-4 pt-3 pb-[calc(var(--inset-bottom)+0.75rem)] dark:bg-background">
			{isEditing ? (
				<Button
					disabled={isSubmitting}
					onClick={onCancel}
					type="button"
					variant="outline"
				>
					Cancel
				</Button>
			) : null}
			<Button loading={isSubmitting} type="submit">
				{submitLabel}
			</Button>
		</div>
	);
};
