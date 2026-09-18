import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { GlobalErrorPage } from "@/components/global-error-page";
import { NotFoundPage } from "@/components/not-found-page";
import { OfflineBanner } from "@/components/offline-banner";
import { GlobalDialog } from "@/components/ui/global-dialog";
import { GlobalSheet } from "@/components/ui/global-sheet";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsCoarsePointer } from "@/hooks/use-mobile";

export interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	errorComponent: GlobalErrorPage,
	notFoundComponent: NotFoundPage,
});

// Clears the tab bar, so "Work started" never lands on top of the nav the
// worker is about to tap.
const TOUCH_TOAST_OFFSET = {
	bottom: "calc(env(safe-area-inset-bottom) + 4.25rem)",
};

function RootComponent() {
	// Top-right lands on top of the mobile header, and far from the thumb.
	const isCoarsePointer = useIsCoarsePointer();

	return (
		<TooltipProvider>
			<Toaster
				richColors
				position={isCoarsePointer ? "bottom-center" : "top-right"}
				offset={isCoarsePointer ? TOUCH_TOAST_OFFSET : undefined}
				mobileOffset={isCoarsePointer ? TOUCH_TOAST_OFFSET : undefined}
				className="pointer-events-auto"
				closeButton
			/>
			{/* The viewport is claimed here, not in the shell: when the counter
			    drops offline the banner has to take its height off the app rather
			    than push it past the bottom of the screen. */}
			<div className="flex h-dvh flex-col">
				<OfflineBanner />
				<main className="min-h-0 flex-1 overflow-auto bg-background text-foreground">
					<Outlet />
				</main>
			</div>
			<GlobalSheet />
			<GlobalDialog />
		</TooltipProvider>
	);
}
