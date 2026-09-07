// Saves a file with the current screen kept open behind it: a click on an
// anchor is the one way a browser starts a download without leaving the page.
export function triggerDownload(href: string, filename?: string): void {
	const link = document.createElement("a");
	link.href = href;
	if (filename) {
		link.download = filename;
	}
	document.body.appendChild(link);
	link.click();
	link.remove();
}
