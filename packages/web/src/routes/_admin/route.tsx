import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { requireAuth } from "@/lib/auth";

export const Route = createFileRoute("/_admin")({
	beforeLoad: requireAuth,
	component: AdminLayout,
});

const pageMeta: Record<string, { title: string; description?: string }> = {
	"/": {
		title: "Dashboard",
		description:
			"React + TanStack migration baseline with shared API contracts.",
	},
	"/categories": {
		title: "Categories",
		description: "Insert and edit category master data.",
	},
	"/campaigns": {
		title: "Campaigns",
		description: "Create and manage discount campaigns per store.",
	},
	"/customers": {
		title: "Customers",
		description: "Insert and edit customer master data.",
	},
	"/orders": {
		title: "Orders",
		description:
			"Review historical orders, payment status, and order detail records.",
	},
	"/orders/new": {
		title: "Create Order",
		description: "Create a new order from products and services.",
	},
	"/transactions": {
		title: "Transactions",
		description:
			"Run the POS workspace with catalog tabs, cart, customer selection, and payment setup.",
	},
	"/payment-methods": {
		title: "Payment Methods",
		description: "Insert and edit payment method master data.",
	},
	"/products": {
		title: "Products",
		description: "Insert and edit product master data.",
	},
	"/services": {
		title: "Services",
		description: "Insert and edit service master data.",
	},
	"/stores": {
		title: "Stores",
		description: "Insert and edit store master data.",
	},
	"/users": {
		title: "Users",
		description: "Insert and edit users with role management.",
	},
	"/worker": {
		title: "Queue",
		description:
			"Priority-first worker queue with item detail and photo upload.",
	},
};

function AdminLayout() {
	const { pathname } = useLocation();
	const meta =
		pageMeta[pathname] ??
		(pathname.startsWith("/worker/")
			? {
					title: "Queue Detail",
					description: "Update one queue item and upload progress photos.",
				}
			: pathname.startsWith("/orders/")
				? {
						title: "Order Detail",
						description: "Review one order and its service timeline.",
					}
				: {
						title: "Admin",
						description: "Admin panel",
					});

	return (
		<AppShell title={meta.title} description={meta.description}>
			<Outlet />
		</AppShell>
	);
}
