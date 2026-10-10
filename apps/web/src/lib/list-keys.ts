// List shortcuts stay quiet while someone is typing or a dialog or sheet is
// open, so J in a customer's name never moves the list underneath.
export const isListKeyBlocked = (event: KeyboardEvent) => {
	if (
		event.defaultPrevented ||
		event.metaKey ||
		event.ctrlKey ||
		event.altKey
	) {
		return true;
	}
	const target = event.target;
	if (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
	) {
		return true;
	}
	return document.querySelector('[role="dialog"]') !== null;
};
