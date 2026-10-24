import { useEffect } from "react";

const EDGE_GUARD = 24;
const TAPPABLE = "a, button, input, label, select, textarea, [contenteditable]";

/**
 * While a full-screen layer is open — a sheet, the photo viewer — an iPhone swipe from
 * the screen edge goes back (or forward) a page and loses the list underneath; the swipe
 * belongs to the layer instead.
 */
export const useBlockEdgeSwipe = (node: HTMLElement | null) => {
	useEffect(() => {
		if (!node) {
			return;
		}
		const doc = node.ownerDocument;
		const block = (event: TouchEvent) => {
			const x = event.touches[0]?.clientX;
			if (
				x === undefined ||
				(x >= EDGE_GUARD && x <= doc.documentElement.clientWidth - EDGE_GUARD)
			) {
				return;
			}
			// Cancelling the touch cancels its tap too, so controls at the edge keep it.
			if ((event.target as Element | null)?.closest(TAPPABLE)) {
				return;
			}
			event.preventDefault();
		};
		// On the document, after the sheet has claimed the touch for its own swipe:
		// cancelled any earlier, the sheet ignored it and didn't close either.
		doc.addEventListener("touchstart", block, { passive: false });
		return () => doc.removeEventListener("touchstart", block);
	}, [node]);
};
