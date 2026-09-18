import type { JWTPayload } from "@fresclean/api/types";
import {
	ChartLineIcon,
	ClockIcon,
	CreditCardIcon,
	HouseIcon,
	IdentificationCardIcon,
	ListIcon,
	PackageIcon,
	ReceiptIcon,
	ScissorsIcon,
	ShoppingCartIcon,
	StorefrontIcon,
	TagIcon,
	UserGearIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import type { LinkProps } from "@tanstack/react-router";
import type { ComponentType } from "react";

export type Role = JWTPayload["role"];

export type NavItem = {
	to: LinkProps["to"];
	label: string;
	// Page heading when it differs from the sidebar label.
	title?: string;
	description: string;
	icon: ComponentType<{ className?: string }>;
	roles: Role[];
};

const operationsNavigation: NavItem[] = [
	{
		to: "/reports",
		label: "Reports",
		title: "Daily Report",
		description: "One day's revenue, items, and orders",
		icon: ChartLineIcon,
		roles: ["admin"],
	},
	{
		to: "/users",
		label: "Users",
		description: "Staff accounts and roles",
		icon: UserGearIcon,
		roles: ["admin"],
	},
	{
		to: "/stores",
		label: "Stores",
		description: "Shop locations and their details",
		icon: StorefrontIcon,
		roles: ["admin"],
	},
];

const workNavigation: NavItem[] = [
	{
		to: "/attendance",
		label: "Attendance",
		description: "Clock in, clock out, and see your recent shifts",
		icon: ClockIcon,
		roles: ["cashier", "worker", "courier"],
	},
	{
		to: "/transactions",
		label: "Transactions",
		description: "Take an order and collect payment",
		icon: ShoppingCartIcon,
		roles: ["admin", "cashier", "worker"],
	},
	{
		to: "/queue",
		label: "Queue",
		description: "Items waiting for work, most urgent first",
		icon: ScissorsIcon,
		roles: ["admin", "cashier", "worker"],
	},
	{
		to: "/orders",
		label: "Orders",
		description: "Past orders and what was paid",
		icon: ReceiptIcon,
		roles: ["admin", "cashier", "worker"],
	},
	{
		to: "/complaints",
		label: "Complaints",
		description: "Complaints raised after pickup",
		icon: WarningCircleIcon,
		roles: ["admin", "cashier", "worker"],
	},
	{
		to: "/shifts",
		label: "Shifts",
		description: "Who clocked in and out, and when",
		icon: ClockIcon,
		roles: ["admin"],
	},
];

const customersNavigation: NavItem[] = [
	{
		to: "/customers",
		label: "Customers",
		description: "Names, phones, and addresses",
		icon: IdentificationCardIcon,
		roles: ["admin", "cashier"],
	},
	{
		to: "/campaigns",
		label: "Campaigns",
		description: "Discounts and vouchers, per store",
		icon: TagIcon,
		roles: ["admin", "cashier"],
	},
];

const catalogNavigation: NavItem[] = [
	{
		to: "/services",
		label: "Services",
		description: "The work the shop does, and list prices",
		icon: ScissorsIcon,
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
		icon: ListIcon,
		roles: ["admin"],
	},
	{
		to: "/payment-methods",
		label: "Payment Methods",
		description: "How customers can pay",
		icon: CreditCardIcon,
		roles: ["admin"],
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
	icon: HouseIcon,
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
