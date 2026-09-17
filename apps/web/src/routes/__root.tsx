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

function RootComponent() {
	// Top-right lands on top of the mobile header, and far from the thumb.
	const isCoarsePointer = useIsCoarsePointer();

	return (
		<TooltipProvider>
			<Toaster
				richColors
				position={isCoarsePointer ? "bottom-center" : "top-right"}
				className="pointer-events-auto"
				closeButton
			/>
			<OfflineBanner />
			<main className="min-h-dvh bg-background text-foreground">
				<Outlet />
			</main>
			<GlobalSheet />
			<GlobalDialog />
		</TooltipProvider>
	);
}
