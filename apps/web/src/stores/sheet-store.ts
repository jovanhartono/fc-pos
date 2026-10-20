import type { ReactNode } from "react";
import { create } from "zustand";

type RenderNode = () => ReactNode;

type SheetState = {
	open: boolean;
	title: ReactNode;
	description: string | null;
	content: RenderNode | null;
	size: SheetSize;
	back: SheetBack | null;
	backLabel: string | null;
	actions: ReactNode;
	onClose: (() => void) | null;
};

type SheetSize = "wide" | undefined;

// A sheet opened from another sheet, like an Item's from a worker's, offers
// the way back above its title.
type SheetBack = { label: string; onClick: () => void };

export type OpenSheetPayload = {
	title?: ReactNode;
	description?: string | null;
	content: RenderNode;
	size?: SheetSize;
	back?: SheetBack;
	// What a sheet opened over this one calls it in its back link, when the
	// title is not plain text (an Order's title is hidden behind its own header).
	backLabel?: string;
	// A row at the top of the header, like the Orders list's previous/next.
	actions?: ReactNode;
	// When the person closes the sheet, not when code closes it to leave the
	// page; a sheet opened over this one inherits it.
	onClose?: () => void;
};

type SheetStore = {
	sheetState: SheetState;
	isDirty: boolean;
	setOpen: (open: boolean) => void;
	openSheet: (payload: OpenSheetPayload) => void;
	// Opens over the sheet already showing, with a back link to it; with none
	// open it is a plain openSheet.
	openNestedSheet: (payload: OpenSheetPayload) => void;
	// After a save: back to the sheet underneath, or close when there is none.
	goBack: () => void;
	closeSheet: () => void;
	clearClosedSheet: () => void;
	setDirty: (dirty: boolean) => void;
};

const defaultState: SheetState = {
	open: false,
	title: null,
	description: null,
	content: null,
	size: undefined,
	back: null,
	backLabel: null,
	actions: null,
	onClose: null,
};

export const useSheet = create<SheetStore>((set, get) => ({
	sheetState: defaultState,
	isDirty: false,
	setOpen: (open) =>
		set((state) => ({
			sheetState: {
				...state.sheetState,
				open,
			},
		})),
	openSheet: ({
		title = null,
		description = null,
		content,
		size,
		back,
		backLabel,
		actions = null,
		onClose,
	}) =>
		set({
			sheetState: {
				title,
				description,
				content,
				size,
				back: back ?? null,
				backLabel: backLabel ?? null,
				actions,
				onClose: onClose ?? null,
				open: true,
			},
			isDirty: false,
		}),
	openNestedSheet: (payload) => {
		const below = get().sheetState;
		if (!below.open) {
			get().openSheet(payload);
			return;
		}
		get().openSheet({
			onClose: below.onClose ?? undefined,
			...payload,
			back: {
				label:
					below.backLabel ??
					(typeof below.title === "string" ? below.title : "Back"),
				onClick: () => set({ sheetState: below, isDirty: false }),
			},
		});
	},
	goBack: () => {
		const { back } = get().sheetState;
		if (back) {
			back.onClick();
			return;
		}
		get().closeSheet();
	},
	closeSheet: () =>
		set((state) => ({
			sheetState: {
				...state.sheetState,
				open: false,
			},
			isDirty: false,
		})),
	// Called once the slide-out has finished, so the header stays on the panel
	// all the way out; leaves alone a sheet opened in the meantime.
	clearClosedSheet: () => {
		if (!get().sheetState.open) {
			set({ sheetState: defaultState });
		}
	},
	setDirty: (dirty) => set({ isDirty: dirty }),
}));
