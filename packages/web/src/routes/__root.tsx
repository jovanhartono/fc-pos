import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { GlobalErrorPage } from "@/components/global-error-page";
import { NotFoundPage } from "@/components/not-found-page";
import { GlobalDialog } from "@/components/ui/global-dialog";
import { GlobalSheet } from "@/components/ui/global-sheet";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	errorComponent: GlobalErrorPage,
	notFoundComponent: NotFoundPage,
});

function RootComponent() {
	return (
		<TooltipProvider>
			<Toaster
				richColors
				position="top-right"
				className="pointer-events-auto"
				closeButton
			/>
			<main className="min-h-dvh bg-background text-foreground">
				<Outlet />
			</main>
			<GlobalSheet />
			<GlobalDialog />
		</TooltipProvider>
	);
}
