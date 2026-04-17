import {
	BuildingsIcon,
	CreditCardIcon,
	HouseIcon,
	IdentificationCardIcon,
	ListIcon,
	PackageIcon,
	ScissorsIcon,
	ShoppingCartIcon,
	SignOutIcon,
	StorefrontIcon,
	UserGearIcon,
} from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ComponentType, type PropsWithChildren, useEffect } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { getCurrentUser, useAuthStore } from "@/stores/auth-store";

type Role = "admin" | "cashier" | "worker";
type NavItem = {
	to: string;
	label: string;
	icon: ComponentType<{ className?: string; weight?: "duotone" }>;
	roles: Role[];
	search?: Record<string, number>;
};

const mainNavigation: NavItem[] = [
	{ to: "/", label: "Dashboard", icon: HouseIcon, roles: ["admin", "cashier"] },
	{
		to: "/worker",
		label: "Queue",
		icon: ScissorsIcon,
		roles: ["admin", "cashier", "worker"],
	},
];

const masterDataNavigation: NavItem[] = [
	{
		to: "/orders",
		label: "Orders",
		icon: ShoppingCartIcon,
		roles: ["admin", "cashier"],
		search: { page: 1 },
	},
	{
		to: "/campaigns",
		label: "Campaigns",
		icon: CreditCardIcon,
		roles: ["admin", "cashier"],
		search: { page: 1 },
	},
	{
		to: "/customers",
		label: "Customers",
		icon: IdentificationCardIcon,
		roles: ["admin", "cashier"],
		search: { page: 1 },
	},
	{
		to: "/users",
		label: "Users",
		icon: UserGearIcon,
		roles: ["admin"],
		search: { page: 1 },
	},
	{ to: "/stores", label: "Stores", icon: StorefrontIcon, roles: ["admin"] },
	{ to: "/categories", label: "Categories", icon: ListIcon, roles: ["admin"] },
	{ to: "/services", label: "Services", icon: ScissorsIcon, roles: ["admin"] },
	{ to: "/products", label: "Products", icon: PackageIcon, roles: ["admin"] },
	{
		to: "/payment-methods",
		label: "Payment Methods",
		icon: CreditCardIcon,
		roles: ["admin"],
	},
] as const;

const transactionNavigation: NavItem[] = [
	{
		to: "/transactions",
		label: "Transactions",
		icon: ShoppingCartIcon,
		roles: ["admin", "cashier"],
	},
] as const;

interface AppShellProps extends PropsWithChildren {
	title: string;
	description?: string;
}

function FloatingSidebarTrigger() {
	const { isMobile, state } = useSidebar();

	if (isMobile) {
		return (
			<SidebarTrigger className="fixed left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-20 size-8 border border-sidebar-border/70 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80" />
		);
	}

	if (state === "collapsed") {
		return (
			<SidebarTrigger className="fixed left-2 top-1/2 z-20 size-8 -translate-y-1/2 border border-sidebar-border/70 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80" />
		);
	}

	return null;
}

function SidebarNavLinks({ items }: { items: readonly NavItem[] }) {
	return (
		<SidebarMenu>
			{items.map((item) => {
				const Icon = item.icon;

				return (
					<SidebarMenuItem key={item.to}>
						<SidebarMenuButton
							render={
								<Link
									to={item.to}
									search={item.search}
									className={cn("text-foreground")}
									activeProps={{
										"data-active": "true",
										className: "text-foreground",
									}}
								/>
							}
							tooltip={item.label}
						>
							<Icon className="size-4" />
							<span>{item.label}</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				);
			})}
		</SidebarMenu>
	);
}

export function AppShell({ title, children }: AppShellProps) {
	const navigate = useNavigate();
	const clearToken = useAuthStore((state) => state.clearToken);
	const user = getCurrentUser();
	const role = user?.role as Role | undefined;

	useEffect(() => {
		document.title = `${title} | Fresclean POS`;
	}, [title]);

	const handleLogout = () => {
		clearToken();
		void navigate({ to: "/auth/login" });
	};

	const allowedMainNavigation = mainNavigation.filter((item) =>
		role ? item.roles.includes(role) : false,
	);
	const allowedMasterNavigation = masterDataNavigation.filter((item) =>
		role ? item.roles.includes(role) : false,
	);
	const allowedTransactionNavigation = transactionNavigation.filter((item) =>
		role ? item.roles.includes(role) : false,
	);

	return (
		<SidebarProvider>
			<Sidebar collapsible="offcanvas" variant="inset">
				<SidebarHeader className="flex-row items-center justify-between">
					<div className="flex items-center gap-2 px-2 text-sm font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/80">
						<BuildingsIcon className="size-4" />
						Fresclean POS
					</div>
					<SidebarTrigger className="size-6 shrink-0" />
				</SidebarHeader>

				<SidebarSeparator />

				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarNavLinks items={allowedMainNavigation} />
						</SidebarGroupContent>
					</SidebarGroup>

					{allowedMasterNavigation.length > 0 ? (
						<SidebarGroup>
							<SidebarGroupLabel>Master Data</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarNavLinks items={allowedMasterNavigation} />
							</SidebarGroupContent>
						</SidebarGroup>
					) : null}

					{allowedTransactionNavigation.length > 0 ? (
						<SidebarGroup>
							<SidebarGroupLabel>Transactions</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarNavLinks items={allowedTransactionNavigation} />
							</SidebarGroupContent>
						</SidebarGroup>
					) : null}
				</SidebarContent>

				<SidebarFooter>
					<div className="space-y-3 border border-sidebar-border/70 bg-background px-3 py-3">
						<ModeToggle />
						<div>
							<p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
								Signed in as
							</p>
							<p className="mt-1 text-sm font-medium">
								{user?.name ?? "Unknown User"}
							</p>
							<p className="text-xs text-muted-foreground">
								@{user?.username ?? "-"}
							</p>
						</div>
						<Button
							variant="outline"
							className="w-full justify-start"
							onClick={handleLogout}
							icon={<SignOutIcon className="size-4" />}
						>
							Logout
						</Button>
					</div>
				</SidebarFooter>
			</Sidebar>

			<SidebarInset>
				<FloatingSidebarTrigger />
				<section className="overflow-x-hidden px-3 pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:py-5 md:px-8 md:py-6 lg:px-10">
					{children}
				</section>
			</SidebarInset>
		</SidebarProvider>
	);
}
