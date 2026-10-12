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
};

type SheetSize = "wide" | undefined;

// A sheet opened from another sheet, like an Item's from a worker's, offers
// the way back above its title.
type SheetBack = { label: string; onClick: () => void };

type OpenSheetPayload = {
	title?: ReactNode;
	description?: string | null;
	content: RenderNode;
	size?: SheetSize;
	back?: SheetBack;
};

type SheetStore = {
	sheetState: SheetState;
	isDirty: boolean;
	setOpen: (open: boolean) => void;
	openSheet: (payload: OpenSheetPayload) => void;
	closeSheet: () => void;
	setDirty: (dirty: boolean) => void;
};

const defaultState: SheetState = {
	open: false,
	title: null,
	description: null,
	content: null,
	size: undefined,
	back: null,
};

export const useSheet = create<SheetStore>((set) => ({
	sheetState: defaultState,
	isDirty: false,
	setOpen: (open) =>
		set((state) => ({
			sheetState: {
				...state.sheetState,
				open,
			},
		})),
	openSheet: ({ title = null, description = null, content, size, back }) =>
		set({
			sheetState: {
				title,
				description,
				content,
				size,
				back: back ?? null,
				open: true,
			},
			isDirty: false,
		}),
	closeSheet: () => {
		set((state) => ({
			sheetState: {
				...state.sheetState,
				open: false,
			},
			isDirty: false,
		}));

		setTimeout(() => {
			set({ sheetState: defaultState });
		}, 200);
	},
	setDirty: (dirty) => set({ isDirty: dirty }),
}));
