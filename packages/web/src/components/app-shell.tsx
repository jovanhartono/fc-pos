import {
	Buildings,
	CreditCard,
	House,
	IdentificationCard,
	List,
	Package,
	Scissors,
	ShoppingCart,
	SignOut,
	Storefront,
	UserGear,
} from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	type ComponentType,
	type PropsWithChildren,
	useEffect,
	useState,
} from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
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
	{ to: "/", label: "Dashboard", icon: House, roles: ["admin", "cashier"] },
	{
		to: "/worker",
		label: "Worker Ops",
		icon: Scissors,
		roles: ["admin", "cashier", "worker"],
	},
];

const masterDataNavigation: NavItem[] = [
	{
		to: "/orders",
		label: "Orders",
		icon: ShoppingCart,
		roles: ["admin", "cashier"],
		search: { page: 1 },
	},
	{
		to: "/campaigns",
		label: "Campaigns",
		icon: CreditCard,
		roles: ["admin", "cashier"],
		search: { page: 1 },
	},
	{
		to: "/customers",
		label: "Customers",
		icon: IdentificationCard,
		roles: ["admin", "cashier"],
		search: { page: 1 },
	},
	{
		to: "/users",
		label: "Users",
		icon: UserGear,
		roles: ["admin"],
		search: { page: 1 },
	},
	{ to: "/stores", label: "Stores", icon: Storefront, roles: ["admin"] },
	{ to: "/categories", label: "Categories", icon: List, roles: ["admin"] },
	{ to: "/services", label: "Services", icon: Scissors, roles: ["admin"] },
	{ to: "/products", label: "Products", icon: Package, roles: ["admin"] },
	{
		to: "/payment-methods",
		label: "Payment Methods",
		icon: CreditCard,
		roles: ["admin"],
	},
] as const;

const transactionNavigation: NavItem[] = [
	{
		to: "/transactions",
		label: "Transactions",
		icon: ShoppingCart,
		roles: ["admin", "cashier"],
	},
] as const;

interface AppShellProps extends PropsWithChildren {
	title: string;
	description?: string;
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
							<Icon className="size-4" weight="duotone" />
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
	const { theme } = useTheme();
	const [isSystemDark, setIsSystemDark] = useState(false);

	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => setIsSystemDark(media.matches);
		onChange();
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, []);

	useEffect(() => {
		document.title = `${title} | Fresclean POS`;
	}, [title]);

	const isDarkMode = theme === "dark" || (theme === "system" && isSystemDark);

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
						<Buildings className="size-4" weight="duotone" />
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
					<div className="rounded-none border border-sidebar-border/70 bg-background px-3 py-3">
						<div className="mb-3 flex items-center justify-between">
							<p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
								Theme
							</p>
							<Badge variant={isDarkMode ? "secondary" : "outline"}>
								{isDarkMode ? "Dark ON" : "Dark OFF"}
							</Badge>
						</div>

						<div className="mb-3">
							<ModeToggle />
						</div>

						<p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
							Signed in as
						</p>
						<p className="mt-1 text-sm font-medium">
							{user?.name ?? "Unknown User"}
						</p>
						<p className="text-xs text-muted-foreground">
							@{user?.username ?? "-"}
						</p>

						<Button
							variant="outline"
							className="mt-3 w-full justify-start"
							onClick={handleLogout}
							icon={<SignOut className="size-4" weight="duotone" />}
						>
							Logout
						</Button>
					</div>
				</SidebarFooter>
			</Sidebar>

			<SidebarInset>
				<section className="px-3 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:py-5 md:px-8 md:py-6 lg:px-10">
					{children}
				</section>
			</SidebarInset>
		</SidebarProvider>
	);
}
