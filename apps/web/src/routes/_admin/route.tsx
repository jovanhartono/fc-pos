import {
	createFileRoute,
	type ErrorComponentProps,
	Outlet,
	useLocation,
} from "@tanstack/react-router";
import { pageTitleFor } from "@/components/app-navigation";
import { AppShell } from "@/components/app-shell";
import { ErrorCard } from "@/components/global-error-page";
import { usersQueries } from "@/features/users/api";
import { requireAuth } from "@/lib/auth";

export const Route = createFileRoute("/_admin")({
	beforeLoad: async ({ context }) => {
		requireAuth();
		// DB-fresh role — JWT claim goes stale on mid-session role changes.
		const me = await context.queryClient.ensureQueryData(usersQueries.me());
		return { me };
	},
	component: AdminLayout,
	errorComponent: AdminErrorComponent,
});

function AdminErrorComponent(props: ErrorComponentProps) {
	return (
		<AppShell title="Application Error">
			<div className="grid place-items-center py-10">
				<ErrorCard {...props} />
			</div>
		</AppShell>
	);
}

function AdminLayout() {
	const { pathname } = useLocation();

	return (
		<AppShell title={pageTitleFor(pathname)}>
			<Outlet />
		</AppShell>
	);
}
