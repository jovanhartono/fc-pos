import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { GlobalErrorPage } from "@/components/global-error-page";
import { GlobalDialog } from "@/components/ui/global-dialog";
import { GlobalSheet } from "@/components/ui/global-sheet";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	// errorComponent: GlobalErrorPage,
	notFoundComponent: NotFoundPage,
});

function NotFoundPage() {
	useEffect(() => {
		document.title = "Page Not Found | Fresclean POS";
	}, []);

	return (
		<div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Page not found
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					The route does not exist in the new React router tree.
				</p>
			</div>
		</div>
	);
}

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
