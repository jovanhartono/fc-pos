import { type ComponentType, lazy } from "react";

// Like next/dynamic: the component's code loads the first time it draws, or
// sooner when preload() runs, e.g. as the pointer reaches what opens it.
export const lazyWithPreload = <Props extends object>(
	load: () => Promise<ComponentType<Props>>,
) => {
	let loading: Promise<ComponentType<Props>> | undefined;
	const start = () => {
		// A hover that hit dropped Wi-Fi leaves nothing behind; the next one tries again.
		loading ??= load().catch((error: unknown) => {
			loading = undefined;
			throw error;
		});
		return loading;
	};
	// An event handler: a failed early download is left for the draw to report.
	const preload = () => {
		start().catch(() => undefined);
	};
	return Object.assign(
		lazy(async () => ({ default: await start() })),
		{ preload },
	);
};
