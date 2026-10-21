import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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

// The whole app is booting, not a page: on the day's first open nothing is known
// yet about the cashier's screen, and the shell's nav waits on the same lookup,
// so a skeleton or an empty sidebar would draw the wrong shape.
const AdminPendingComponent = () => (
	<output aria-busy className="grid h-full place-items-center">
		<HugeiconsIcon
			icon={Loading03Icon}
			className="size-8 animate-spin text-muted-foreground motion-reduce:animate-none"
		/>
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
