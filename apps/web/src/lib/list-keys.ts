// List shortcuts stay quiet while someone is typing or a dialog or sheet is
// open, so J in a customer's name never moves the list underneath.
// The Order sheet passes `dialogs` so the sheet it sits in doesn't block it.
export const isListKeyBlocked = (
	event: KeyboardEvent,
	dialogs = '[role="dialog"]',
) => {
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
	return document.querySelector(dialogs) !== null;
};
