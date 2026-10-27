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
	isInstant: boolean;
	isRestoredOnBack: boolean;
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
	// Shows without sliding in: a sheet its page reopens after Back.
	isInstant?: boolean;
	// The page reopens this sheet after Back; see useLeaveSheetLink.
	isRestoredOnBack?: boolean;
};

type SheetStore = {
	sheetState: SheetState;
	isDirty: boolean;
	afterClose: (() => void) | null;
	setOpen: (open: boolean) => void;
	openSheet: (payload: OpenSheetPayload) => void;
	// Opens over the sheet already showing, with a back link to it; with none
	// open it is a plain openSheet.
	openNestedSheet: (payload: OpenSheetPayload) => void;
	// After a save: back to the sheet underneath, or close when there is none.
	goBack: () => void;
	closeSheet: () => void;
	closeSheetInstantly: () => void;
	// Runs `then` once the slide-out has finished; see useLeaveSheetLink.
	closeSheetThen: (then: () => void) => void;
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
	isInstant: false,
	isRestoredOnBack: false,
};

const closed = (state: SheetStore, isInstant: boolean) => ({
	sheetState: { ...state.sheetState, open: false, isInstant },
	isDirty: false,
});

export const useSheet = create<SheetStore>((set, get) => ({
	sheetState: defaultState,
	isDirty: false,
	afterClose: null,
	setOpen: (open) =>
		set((state) => ({
			sheetState: {
				...state.sheetState,
				open,
			},
			afterClose: open ? null : state.afterClose,
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
		isInstant = false,
		isRestoredOnBack = false,
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
				isInstant,
				isRestoredOnBack,
				open: true,
			},
			isDirty: false,
			afterClose: null,
		}),
	openNestedSheet: (payload) => {
		const below = get().sheetState;
		if (!below.open) {
			get().openSheet(payload);
			return;
		}
		get().openSheet({
			onClose: below.onClose ?? undefined,
			isRestoredOnBack: below.isRestoredOnBack,
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
	closeSheet: () => set((state) => closed(state, false)),
	// Gone with no slide-out as its page unmounts for a link out of the sheet;
	// one already sliding out, like a sheet swiped away, keeps sliding.
	closeSheetInstantly: () => {
		if (get().sheetState.open) {
			set((state) => closed(state, true));
		}
	},
	// Called once the slide-out has finished, so the header stays on the panel
	// all the way out; leaves alone a sheet opened in the meantime.
	clearClosedSheet: () => {
		if (!get().sheetState.open) {
			const { afterClose } = get();
			set({ sheetState: defaultState, afterClose: null });
			afterClose?.();
		}
	},
	closeSheetThen: (then) => {
		set({ afterClose: then });
		get().closeSheet();
	},
	setDirty: (dirty) => set({ isDirty: dirty }),
}));
