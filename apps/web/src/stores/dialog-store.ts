import type { ReactNode } from "react";
import { create } from "zustand";

type RenderNode = () => ReactNode;

type DialogState = {
	open: boolean;
	title: string | null;
	description: string | null;
	content: RenderNode | null;
	footer: RenderNode | null;
	contentClassName: string | null;
};

type OpenDialogPayload = {
	title?: string | null;
	description?: string | null;
	content?: RenderNode | null;
	footer?: RenderNode | null;
	contentClassName?: string | null;
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
	contentClassName: null,
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
		contentClassName = null,
	}) =>
		set({
			dialogState: {
				title,
				description,
				content,
				footer,
				contentClassName,
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
