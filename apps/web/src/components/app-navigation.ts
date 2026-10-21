import type { JWTPayload } from "@fresclean/api/types";
import {
	Analytics01Icon,
	CalendarClockIcon,
	Cashier02Icon,
	DiscountTag01Icon,
	FingerPrintScanIcon,
	GridViewIcon,
	Home03Icon,
	Invoice01Icon,
	MessageCircleWarningIcon,
	PackageIcon,
	ShoppingCart01Icon,
	Store01Icon,
	Task01Icon,
	ToolsIcon,
	UserMultipleIcon,
	UserSettings01Icon,
	Wallet01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { LinkProps } from "@tanstack/react-router";

export type Role = JWTPayload["role"];

export type NavItem = {
	to: LinkProps["to"];
	label: string;
	// Page heading when it differs from the sidebar label.
	title?: string;
	description: string;
	icon: IconSvgElement;
	roles: Role[];
};

const operationsNavigation: NavItem[] = [
	{
		to: "/reports",
		label: "Reports",
		title: "Daily Report",
		description: "Revenue, services and orders by day or range",
		icon: Analytics01Icon,
		roles: ["admin"],
	},
	{
		to: "/users",
		label: "Users",
		description: "Staff accounts and roles",
		icon: UserSettings01Icon,
		roles: ["admin"],
	},
	{
		to: "/stores",
		label: "Stores",
		description: "Shop locations and their details",
		icon: Store01Icon,
		roles: ["admin"],
	},
];

const workNavigation: NavItem[] = [
	{
		to: "/counter",
		label: "Counter",
		description:
			"The Store right now: workshop, pickup shelf, what needs a look",
		icon: Cashier02Icon,
		roles: ["admin", "cashier", "worker"],
	},
	{
		to: "/attendance",
		label: "Attendance",
		description: "Clock in, clock out, and see your recent shifts",
		icon: FingerPrintScanIcon,
		roles: ["cashier", "worker", "courier"],
	},
	{
		to: "/transactions",
		label: "Transactions",
		description: "Take an order and collect payment",
		icon: ShoppingCart01Icon,
		roles: ["admin", "cashier", "worker"],
	},
	{
		to: "/queue",
		label: "Queue",
		description: "Items waiting for work, most urgent first",
		icon: Task01Icon,
		roles: ["admin", "cashier", "worker"],
	},
	{
		to: "/orders",
		label: "Orders",
		description: "Past orders and what was paid",
		icon: Invoice01Icon,
		roles: ["admin", "cashier", "worker"],
	},
	{
		to: "/complaints",
		label: "Complaints",
		description: "Customer complaints and their reworks",
		icon: MessageCircleWarningIcon,
		roles: ["admin", "cashier", "worker"],
	},
	{
		to: "/shifts",
		label: "Shifts",
		description: "Who clocked in and out, and when",
		icon: CalendarClockIcon,
		roles: ["admin"],
	},
];

const customersNavigation: NavItem[] = [
	{
		to: "/customers",
		label: "Customers",
		description: "Names, phones, and addresses",
		icon: UserMultipleIcon,
		roles: ["admin", "cashier"],
	},
];

const catalogNavigation: NavItem[] = [
	{
		to: "/services",
		label: "Services",
		description: "The work the shop does, and list prices",
		icon: ToolsIcon,
		roles: ["admin"],
	},
	{
		to: "/products",
		label: "Products",
		description: "Goods sold alongside the work",
		icon: PackageIcon,
		roles: ["admin"],
	},
	{
		to: "/categories",
		label: "Categories",
		description: "Groups for services and products",
		icon: GridViewIcon,
		roles: ["admin"],
	},
	{
		to: "/payment-methods",
		label: "Payment methods",
		description: "How customers can pay",
		icon: Wallet01Icon,
		roles: ["admin"],
	},
	{
		to: "/campaigns",
		label: "Campaigns",
		description: "Discounts and vouchers, per store",
		icon: DiscountTag01Icon,
		roles: ["admin", "cashier"],
	},
];

export const NAV_GROUPS = [
	{ label: "Operations", items: operationsNavigation },
	{ label: "Work", items: workNavigation },
	{ label: "Customers", items: customersNavigation },
	{ label: "Catalog", items: catalogNavigation },
];

export const HOME_NAV_ITEM: NavItem = {
	to: "/",
	label: "Home",
	description: "Everything this role can open",
	icon: Home03Icon,
	roles: ["admin", "cashier", "worker", "courier"],
};

// On a phone the tab bar is the whole navigation. Home leads for every role and
// lands on the launcher, which already lists the rest; the screens after it are
// the ones that role works from all shift — a courier only ever clocks in.
const tabBarPaths: Record<Role, NavItem["to"][]> = {
	admin: ["/orders", "/reports"],
	cashier: ["/transactions", "/orders"],
	worker: ["/queue", "/complaints"],
	courier: ["/attendance"],
};

export const navGroupsForRole = (role: Role) =>
	NAV_GROUPS.map((group) => ({
		label: group.label,
		items: group.items.filter((item) => item.roles.includes(role)),
	})).filter((group) => group.items.length > 0);

// Resolved against what the role may already open, so the list above only
// decides order — never access.
export const tabBarItemsForRole = (role: Role) => {
	const allowed = navGroupsForRole(role).flatMap((group) => group.items);
	return [
		HOME_NAV_ITEM,
		...tabBarPaths[role].flatMap((to) =>
			allowed.filter((item) => item.to === to),
		),
	];
};

const detailTitles: [string, string][] = [
	["/queue/", "Queue Detail"],
	["/orders/", "Order Detail"],
	["/complaints/", "Complaint Detail"],
	["/customers/", "Customer Detail"],
];

export const pageTitleFor = (pathname: string) => {
	if (pathname === "/") {
		return "Home";
	}
	const item = NAV_GROUPS.flatMap((group) => group.items).find(
		(navItem) => navItem.to === pathname,
	);
	if (item) {
		return item.title ?? item.label;
	}
	return (
		detailTitles.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Admin"
	);
};
