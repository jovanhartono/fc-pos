import {
	BuildingsIcon,
	ChartLineIcon,
	ClockIcon,
	CreditCardIcon,
	HouseIcon,
	IdentificationCardIcon,
	ListIcon,
	MonitorIcon,
	MoonIcon,
	PackageIcon,
	ReceiptIcon,
	ScissorsIcon,
	ShoppingCartIcon,
	SignOutIcon,
	StorefrontIcon,
	SunIcon,
	TagIcon,
	UserGearIcon,
} from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ComponentType, type PropsWithChildren, useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
	SidebarRail,
	SidebarSeparator,
	SidebarTrigger,
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

const workNavigation: NavItem[] = [
	{
		to: "/attendance",
		label: "Attendance",
		icon: ClockIcon,
		roles: ["cashier", "worker"],
	},
	{
		to: "/transactions",
		label: "Transactions",
		icon: ShoppingCartIcon,
		roles: ["admin", "cashier"],
	},
	{
		to: "/worker",
		label: "Queue",
		icon: ScissorsIcon,
		roles: ["admin", "cashier", "worker"],
	},
	{
		to: "/orders",
		label: "Orders",
		icon: ReceiptIcon,
		roles: ["admin", "cashier"],
		search: { page: 1 },
	},
	{
		to: "/shifts",
		label: "Shifts",
		icon: ClockIcon,
		roles: ["admin"],
	},
] as const;

const customersNavigation: NavItem[] = [
	{
		to: "/customers",
		label: "Customers",
		icon: IdentificationCardIcon,
		roles: ["admin", "cashier"],
		search: { page: 1 },
	},
	{
		to: "/campaigns",
		label: "Campaigns",
		icon: TagIcon,
		roles: ["admin", "cashier"],
		search: { page: 1 },
	},
] as const;

const catalogNavigation: NavItem[] = [
	{ to: "/services", label: "Services", icon: ScissorsIcon, roles: ["admin"] },
	{ to: "/products", label: "Products", icon: PackageIcon, roles: ["admin"] },
	{ to: "/categories", label: "Categories", icon: ListIcon, roles: ["admin"] },
	{
		to: "/payment-methods",
		label: "Payment Methods",
		icon: CreditCardIcon,
		roles: ["admin"],
	},
] as const;

const operationsNavigation: NavItem[] = [
	{
		to: "/",
		label: "Dashboard",
		icon: HouseIcon,
		roles: ["admin"],
	},
	{
		to: "/reports",
		label: "Reports",
		icon: ChartLineIcon,
		roles: ["admin"],
	},
	{
		to: "/users",
		label: "Users",
		icon: UserGearIcon,
		roles: ["admin"],
		search: { page: 1 },
	},
	{ to: "/stores", label: "Stores", icon: StorefrontIcon, roles: ["admin"] },
] as const;

interface AppShellProps extends PropsWithChildren {
	title: string;
	description?: string;
}

const FooterThemeButton = () => {
	const { setTheme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Toggle theme"
						icon={
							<span className="relative size-4">
								<SunIcon className="absolute inset-0 size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
								<MoonIcon className="absolute inset-0 size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
							</span>
						}
					/>
				}
			/>
			<DropdownMenuContent align="end" side="top">
				<DropdownMenuItem onClick={() => setTheme("light")}>
					<SunIcon className="size-4" />
					Light
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("dark")}>
					<MoonIcon className="size-4" />
					Dark
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("system")}>
					<MonitorIcon className="size-4" />
					System
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

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

	const allowedWorkNavigation = workNavigation.filter((item) =>
		role ? item.roles.includes(role) : false,
	);
	const allowedCustomersNavigation = customersNavigation.filter((item) =>
		role ? item.roles.includes(role) : false,
	);
	const allowedCatalogNavigation = catalogNavigation.filter((item) =>
		role ? item.roles.includes(role) : false,
	);
	const allowedOperationsNavigation = operationsNavigation.filter((item) =>
		role ? item.roles.includes(role) : false,
	);

	return (
		<SidebarProvider>
			<Sidebar collapsible="icon" variant="inset">
				<SidebarHeader className="flex-row items-center justify-between group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
					<div className="flex items-center gap-2 px-2 text-sm font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/80">
						<BuildingsIcon className="size-4" />
						<span className="group-data-[collapsible=icon]:hidden">
							Fresclean POS
						</span>
					</div>
					<SidebarTrigger className="size-6 shrink-0" />
				</SidebarHeader>

				<SidebarSeparator />

				<SidebarContent>
					{allowedOperationsNavigation.length > 0 ? (
						<SidebarGroup>
							<SidebarGroupLabel>Operations</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarNavLinks items={allowedOperationsNavigation} />
							</SidebarGroupContent>
						</SidebarGroup>
					) : null}

					{allowedWorkNavigation.length > 0 ? (
						<SidebarGroup>
							<SidebarGroupLabel>Work</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarNavLinks items={allowedWorkNavigation} />
							</SidebarGroupContent>
						</SidebarGroup>
					) : null}

					{allowedCustomersNavigation.length > 0 ? (
						<SidebarGroup>
							<SidebarGroupLabel>Customers</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarNavLinks items={allowedCustomersNavigation} />
							</SidebarGroupContent>
						</SidebarGroup>
					) : null}

					{allowedCatalogNavigation.length > 0 ? (
						<SidebarGroup>
							<SidebarGroupLabel>Catalog</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarNavLinks items={allowedCatalogNavigation} />
							</SidebarGroupContent>
						</SidebarGroup>
					) : null}
				</SidebarContent>

				<SidebarFooter>
					<div className="border border-sidebar-border/70 bg-background group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent">
						<div className="flex items-center gap-2.5 px-2.5 py-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-0">
							<div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
								<p className="truncate font-medium text-sm leading-tight">
									{user?.name ?? "Unknown User"}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-0.5 group-data-[collapsible=icon]:flex-col">
								<FooterThemeButton />
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Logout"
									onClick={handleLogout}
									icon={<SignOutIcon className="size-4" />}
								/>
							</div>
						</div>
						<div className="flex items-center justify-between border-sidebar-border/70 border-t px-2.5 py-1.5 group-data-[collapsible=icon]:hidden">
							<span className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
								Role
							</span>
							<span className="font-semibold text-[10px] uppercase tracking-[0.2em]">
								{role ?? "—"}
							</span>
						</div>
					</div>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>

			<SidebarInset>
				<div className="sticky top-0 z-10 flex items-center gap-2 border-b border-sidebar-border/70 bg-background/95 px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
					<SidebarTrigger className="size-9" />
					<span className="font-semibold text-sm uppercase tracking-[0.18em]">
						Fresclean POS
					</span>
				</div>
				<section className="overflow-x-hidden px-3 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:py-5 md:px-8 md:py-6 lg:px-10">
					{children}
				</section>
			</SidebarInset>
		</SidebarProvider>
	);
}
