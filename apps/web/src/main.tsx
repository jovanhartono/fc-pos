import "@/index.css";

import {
	onlineManager,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { DetailedError } from "hono/client";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { APP_CONTENT_SCROLL_ID } from "@/components/app-shell";
import { RoutePending } from "@/components/route-pending";
import { ThemeProvider } from "@/components/theme-provider";
import { waitForPrints } from "@/features/printing/pending-prints";
import { routeTree } from "@/routeTree.gen";

const ReactQueryDevtools = import.meta.env.DEV
	? lazy(() =>
			import("@tanstack/react-query-devtools").then((module) => ({
				default: module.ReactQueryDevtools,
			})),
		)
	: null;

const queryClient = new QueryClient({
	defaultOptions: {
		mutations: {
			// A payment tapped while offline must fail now, not fire minutes later
			// when the connection returns and the counter has moved on.
			networkMode: "always",
			onSuccess: (response) => {
				if (
					typeof response === "object" &&
					response !== null &&
					"message" in response &&
					typeof response.message === "string"
				) {
					toast.success(response.message);
				}
			},
			onError: (error) => {
				// The offline banner already says why; a toast on top repeats it.
				if (!onlineManager.isOnline()) {
					return;
				}
				if (error instanceof DetailedError) {
					const details = error.detail as
						| { data?: { message?: string } }
						| undefined;
					toast.error(details?.data?.message ?? "Something went wrong");
					return;
				}

				if (error instanceof Error) {
					toast.error(error.message);
					return;
				}

				toast.error("Something went wrong");
			},
		},
	},
});

const router = createRouter({
	routeTree,
	context: {
		queryClient,
	},
	defaultPreload: "intent",
	// Loaders delegate freshness to React Query's staleTime; without this the
	// router's own 30s preload window would shadow it.
	defaultPreloadStaleTime: 0,
	defaultPendingComponent: RoutePending,
	// Opening an order and coming back out used to look identical. Tag each
	// navigation with the direction it went so the two read differently; the
	// slide itself is in index.css.
	defaultViewTransition: {
		types: ({ fromLocation, toLocation }) => {
			if (!fromLocation) {
				return [];
			}
			const segmentsOf = (pathname: string) =>
				pathname.split("/").filter(Boolean);
			const from = segmentsOf(fromLocation.pathname);
			const to = segmentsOf(toLocation.pathname);
			// Only a list and its own record slide — the queue and the item a
			// worker opens from it. Home is every screen's neighbour, not its
			// parent, so tapping a tab crosses over instead of sliding.
			const isChildOf = (child: string[], parent: string[]) =>
				parent.length > 0 &&
				child.length > parent.length &&
				parent.every((segment, index) => child[index] === segment);
			if (isChildOf(to, from)) {
				return ["push"];
			}
			if (isChildOf(from, to)) {
				return ["pop"];
			}
			return [];
		},
	},
	scrollRestoration: true,
	// The page itself no longer scrolls — the shell's content pane does. Without
	// this, opening an order from halfway down the queue would leave the new page
	// parked at the old scroll position.
	scrollToTopSelectors: [
		`[data-scroll-restoration-id="${APP_CONTENT_SCROLL_ID}"]`,
	],
});

// A deploy's new service worker deletes the open app's old files, so the next
// screen opens as a fresh page on the new build instead of failing to load.
let isOldBuild = false;
if ("serviceWorker" in navigator) {
	let controller = navigator.serviceWorker.controller;
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		// The very first install takes over too, but nothing was deleted then.
		isOldBuild ||= controller !== null;
		controller = navigator.serviceWorker.controller;
	});
}
router.history.block({
	blockerFn: ({ action, nextLocation }) => {
		if (!isOldBuild) {
			return false;
		}
		void waitForPrints().then(() => {
			if (action === "PUSH") {
				window.location.assign(nextLocation.href);
			} else if (action === "REPLACE") {
				window.location.replace(nextLocation.href);
			} else {
				// Back and forward have already moved the address bar.
				window.location.reload();
			}
		});
		// Never settles, so the old build never asks for its deleted files.
		return new Promise<boolean>(() => undefined);
	},
	enableBeforeUnload: false,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element not found");
}

createRoot(rootElement).render(
	<StrictMode>
		<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
				{ReactQueryDevtools ? (
					<Suspense fallback={null}>
						<ReactQueryDevtools
							initialIsOpen={false}
							buttonPosition="bottom-right"
						/>
					</Suspense>
				) : null}
				<Analytics />
			</QueryClientProvider>
		</ThemeProvider>
	</StrictMode>,
);
