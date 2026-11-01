import type { RouterHistory } from "@tanstack/react-router";

let isBack = false;

// Back or Forward, not a link, a reload or Cmd+K: the page arrived as Safari's
// swipe-back picture showed it, so a sheet that was open is there at once.
export const trackBackNavigation = (history: RouterHistory) =>
	history.subscribe(({ action }) => {
		isBack = action.type !== "PUSH" && action.type !== "REPLACE";
	});

export const isBackNavigation = () => isBack;
