import type { ReactNode } from "react";
import { create } from "zustand";

type SheetState = {
	open: boolean;
	title: string | null;
	description: string | null;
	content: ReactNode | null;
};

type OpenSheetPayload = {
	title?: string | null;
	description?: string | null;
	content: ReactNode;
};

type SheetStore = {
	sheetState: SheetState;
	setOpen: (open: boolean) => void;
	openSheet: (payload: OpenSheetPayload) => void;
	closeSheet: () => void;
};

const defaultState: SheetState = {
	open: false,
	title: null,
	description: null,
	content: null,
};

export const useSheet = create<SheetStore>((set) => ({
	sheetState: defaultState,
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
		}),
	closeSheet: () => {
		set((state) => ({
			sheetState: {
				...state.sheetState,
				open: false,
			},
		}));

		setTimeout(() => {
			set({ sheetState: defaultState });
		}, 200);
	},
}));

export function useGlobalSheet() {
	const openSheet = useSheet((state) => state.openSheet);
	const closeSheet = useSheet((state) => state.closeSheet);
	const setOpen = useSheet((state) => state.setOpen);

	return { openSheet, closeSheet, setOpen };
}
