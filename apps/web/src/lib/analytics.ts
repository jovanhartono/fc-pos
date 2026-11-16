// Query strings carry Customer phone numbers and names: the Track link and
// every admin search. Page counts and web vitals only need the path.
export const dropQueryString = <T extends { url: string }>(event: T): T => {
	const url = new URL(event.url);
	url.search = "";
	return { ...event, url: url.toString() };
};
