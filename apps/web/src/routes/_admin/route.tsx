import { SpinnerGapIcon } from "@phosphor-icons/react";
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

// The whole app is booting here, not a page — on the first open of the day the
// container is cold and nothing is known yet about the screen the cashier is
// headed for, so a skeleton would be drawing a shape it cannot know. The shell
// is left out for the same reason: its nav comes from the lookup still in
// flight, so it would draw an empty sidebar and pop the tabs in a beat later.
const AdminPendingComponent = () => (
	<output aria-busy className="grid h-full place-items-center">
		<SpinnerGapIcon className="size-8 animate-spin text-muted-foreground motion-reduce:animate-none" />
	</output>
);

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
