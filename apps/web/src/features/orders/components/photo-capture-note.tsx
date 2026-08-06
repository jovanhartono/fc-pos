import { PencilSimpleLineIcon } from "@phosphor-icons/react";
import { Textarea } from "@/components/ui/textarea";
import { usePhotoCapture } from "@/features/orders/components/photo-capture-context";
import { cn } from "@/lib/utils";

export const PhotoCaptureNoteToggle = () => {
	const { actions, meta, state } = usePhotoCapture();

	// One note is filed against the whole batch, so a dialog that only ever holds
	// one photo has nothing to attach it to.
	if (!meta.isMultiple) {
		return null;
	}

	const hasNote = state.note.trim().length > 0;

	return (
		<button
			aria-expanded={state.isNoteOpen}
			aria-label={state.isNoteOpen ? "Hide note" : "Add note"}
			className={cn(
				"relative grid size-12 place-items-center rounded-full transition disabled:opacity-40",
				state.isNoteOpen
					? "bg-white text-black"
					: "bg-white/10 text-white hover:bg-white/20",
			)}
			disabled={state.isBusy}
			onClick={actions.toggleNote}
			type="button"
		>
			<PencilSimpleLineIcon className="size-5" aria-hidden="true" />
			{hasNote && !state.isNoteOpen ? (
				<span className="absolute top-2 right-2 size-1.5 bg-white" />
			) : null}
		</button>
	);
};

export const PhotoCaptureNoteField = () => {
	const { actions, meta, state } = usePhotoCapture();

	if (!state.isNoteOpen) {
		return null;
	}

	return (
		<Textarea
			value={state.note}
			onChange={(event) => actions.setNote(event.target.value)}
			placeholder={meta.labels.notePlaceholder}
			rows={2}
			maxLength={200}
			disabled={state.isBusy}
			aria-label={meta.labels.note}
			className="border-white/20 bg-white/5 text-white placeholder:text-white/50 disabled:opacity-50"
		/>
	);
};
