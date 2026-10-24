import { useNavigate } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { isPlainLeftClick } from "@/lib/list-keys";
import { useSheet } from "@/stores/sheet-store";

/**
 * A link in the global sheet that leaves the page. Safari keeps a picture of each page for
 * swipe back; leaving while the sheet was still sliding out kept it in that picture, so
 * swiping back showed the sheet open, then it vanished. A new-tab click leaves the sheet open.
 */
export const useLeaveSheetLink = () => {
	const navigate = useNavigate();

	return (event: MouseEvent<HTMLAnchorElement>) => {
		const { sheetState, closeSheetThen } = useSheet.getState();
		// The same link on a full page has no sheet to wait for.
		if (!(isPlainLeftClick(event) && sheetState.open)) {
			return;
		}
		event.preventDefault();
		const href = event.currentTarget.getAttribute("href") ?? undefined;
		closeSheetThen(() => navigate({ href }));
	};
};
