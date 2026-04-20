import type { ReactNode } from "react";
import { create } from "zustand";

type RenderNode = () => ReactNode;

type SheetState = {
	open: boolean;
	title: string | null;
	description: string | null;
	content: RenderNode | null;
};

type OpenSheetPayload = {
	title?: string | null;
	description?: string | null;
	content: RenderNode;
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
	openSheet: ({ title = null, description = null, content }) =>
		set({
			sheetState: {
				title,
				description,
				content,
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
