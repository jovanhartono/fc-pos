// Checkout starts the receipt and moves on, so a page load right after would
// cut the receipt off mid-print. Anything that reloads the page waits on this.
let settled: Promise<unknown> = Promise.resolve();

export const trackPrint = (print: Promise<void>) => {
	settled = Promise.allSettled([settled, print]);
};

// A stuck printer must not hold the cashier's next screen forever.
export const waitForPrints = () =>
	Promise.race([
		settled,
		new Promise((resolve) => setTimeout(resolve, 15_000)),
	]);
