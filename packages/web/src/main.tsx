import "@/index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { DetailedError } from "hono/client";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
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
			</QueryClientProvider>
		</ThemeProvider>
	</StrictMode>,
);
