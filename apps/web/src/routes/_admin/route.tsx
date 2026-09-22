import {
	createFileRoute,
	type ErrorComponentProps,
	Outlet,
	useLocation,
} from "@tanstack/react-router";
import { pageTitleFor } from "@/components/app-navigation";
import { APP_CONTENT_PADDING, AppShell } from "@/components/app-shell";
import { ErrorCard } from "@/components/global-error-page";
import { RoutePending } from "@/components/route-pending";
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
	pendingComponent: AdminPendingComponent,
});

// The shell owns the page gutters and has not rendered yet while the role
// lookup is in flight, so the first skeleton of the day would otherwise sit
// flush against both edges of the phone and read as a broken screen. The shell
// itself is deliberately not rendered here — its nav comes from the same
// lookup, so it would draw an empty sidebar and pop the tabs in a beat later.
function AdminPendingComponent() {
	return (
		<div className={APP_CONTENT_PADDING}>
			<RoutePending />
		</div>
	);
}

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
