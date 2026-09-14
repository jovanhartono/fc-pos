import {
	createFileRoute,
	type ErrorComponentProps,
	Outlet,
	useLocation,
} from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ErrorCard } from "@/components/global-error-page";
import { requireAuth } from "@/lib/auth";

export const Route = createFileRoute("/_admin")({
	beforeLoad: requireAuth,
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

const pageMeta: Record<string, { title: string; description?: string }> = {
	"/categories": {
		title: "Categories",
		description: "Groups for services and products",
	},
	"/campaigns": {
		title: "Campaigns",
		description: "Discounts and vouchers, per store",
	},
	"/customers": {
		title: "Customers",
		description: "Names, phones, and addresses",
	},
	"/orders": {
		title: "Orders",
		description: "Past orders and what was paid",
	},
	"/complaints": {
		title: "Complaints",
		description: "Complaints raised after pickup",
	},
	"/transactions": {
		title: "Transactions",
		description: "Take an order and collect payment",
	},
	"/payment-methods": {
		title: "Payment Methods",
		description: "How customers can pay",
	},
	"/products": {
		title: "Products",
		description: "Goods sold alongside the work",
	},
	"/services": {
		title: "Services",
		description: "The work the shop does, and list prices",
	},
	"/stores": {
		title: "Stores",
		description: "Shop locations and their details",
	},
	"/reports": {
		title: "Daily Report",
		description: "One day's revenue, items, and orders",
	},
	"/shifts": {
		title: "Shifts",
		description: "Who clocked in and out, and when",
	},
	"/attendance": {
		title: "Attendance",
		description: "Clock in, clock out, and see your recent shifts",
	},
	"/users": {
		title: "Users",
		description: "Staff accounts and roles",
	},
	"/queue": {
		title: "Queue",
		description: "Items waiting for work, most urgent first",
	},
};

function AdminLayout() {
	const { pathname } = useLocation();
	const meta =
		pageMeta[pathname] ??
		(pathname.startsWith("/queue/")
			? {
					title: "Queue Detail",
					description: "Work on this item and add photos",
				}
			: pathname.startsWith("/orders/")
				? {
						title: "Order Detail",
						description: "This order and everything done to it",
					}
				: pathname.startsWith("/complaints/")
					? {
							title: "Complaint Detail",
							description: "This complaint and its rework",
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
