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

// Pinned to the bottom of the sheet, so Save is in reach at the top of an
// eleven-field Campaign form without scrolling for it; the fields scroll under
// the same frost as the Queue's sticky bar. Adding has no Cancel: the sheet's
// ✕ is the way out.
export const SheetFormActions = ({
	isEditing,
	isSubmitting,
	onCancel,
	addLabel,
}: SheetFormActionsProps) => {
	const submitLabel = isEditing ? "Save" : addLabel;
	return (
		<div className="sticky -bottom-4 z-10 col-span-full -mx-4 -mb-4 grid gap-2 bg-frost px-4 pt-3 pb-[calc(var(--inset-bottom)+0.75rem)] backdrop-blur-xl backdrop-saturate-150">
			<Button loading={isSubmitting} size="lg" type="submit">
				{submitLabel}
			</Button>
			{isEditing ? (
				<Button
					disabled={isSubmitting}
					onClick={onCancel}
					size="lg"
					type="button"
					variant="ghost"
				>
					Cancel
				</Button>
			) : null}
		</div>
	);
};
