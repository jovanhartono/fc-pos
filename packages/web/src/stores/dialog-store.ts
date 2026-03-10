import type { ReactNode } from "react";
import { create } from "zustand";

type DialogState = {
	open: boolean;
	title: string | null;
	description: string | null;
	content: ReactNode | null;
	footer: ReactNode | null;
};

type OpenDialogPayload = {
	title?: string | null;
	description?: string | null;
	content?: ReactNode | null;
	footer?: ReactNode | null;
};

type DialogStore = {
	dialogState: DialogState;
	setOpen: (open: boolean) => void;
	openDialog: (payload: OpenDialogPayload) => void;
	closeDialog: () => void;
};

const defaultState: DialogState = {
	open: false,
	title: null,
	description: null,
	content: null,
	footer: null,
};

export const useDialog = create<DialogStore>((set) => ({
	dialogState: defaultState,
	setOpen: (open) =>
		set((state) => ({
			dialogState: {
				...state.dialogState,
				open,
			},
		})),
	openDialog: ({
		title = null,
		description = null,
		content = null,
		footer = null,
	}) =>
		set({
			dialogState: {
				title,
				description,
				content,
				footer,
				open: true,
			},
		}),
	closeDialog: () => {
		set((state) => ({
			dialogState: {
				...state.dialogState,
				open: false,
			},
		}));

		setTimeout(() => {
			set({ dialogState: defaultState });
		}, 200);
	},
}));
