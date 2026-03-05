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

const mainNavigation = [{ to: "/", label: "Dashboard", icon: House }] as const;

const masterDataNavigation = [
	{ to: "/customers", label: "Customers", icon: IdentificationCard },
	{ to: "/users", label: "Users", icon: UserGear },
	{ to: "/stores", label: "Stores", icon: Storefront },
	{ to: "/categories", label: "Categories", icon: List },
	{ to: "/services", label: "Services", icon: Scissors },
	{ to: "/products", label: "Products", icon: Package },
	{ to: "/payment-methods", label: "Payment Methods", icon: CreditCard },
] as const;

const transactionNavigation = [
	{ to: "/orders", label: "Orders", icon: ShoppingCart },
] as const;

interface AppShellProps extends PropsWithChildren {
	title: string;
	description?: string;
}

function SidebarNavLinks({
	items,
}: {
	items: readonly {
		to: string;
		label: string;
		icon: ComponentType<{ className?: string; weight?: "duotone" }>;
	}[];
}) {
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

export function AppShell({ title, description, children }: AppShellProps) {
	const navigate = useNavigate();
	const clearToken = useAuthStore((state) => state.clearToken);
	const user = getCurrentUser();
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

	return (
		<SidebarProvider>
			<Sidebar collapsible="offcanvas" variant="inset">
				<SidebarHeader>
					<div className="flex items-center gap-2 px-2 text-sm font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/80">
						<Buildings className="size-4" weight="duotone" />
						Fresclean POS
					</div>
				</SidebarHeader>

				<SidebarSeparator />

				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarNavLinks items={mainNavigation} />
						</SidebarGroupContent>
					</SidebarGroup>

					<SidebarGroup>
						<SidebarGroupLabel>Master Data</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarNavLinks items={masterDataNavigation} />
						</SidebarGroupContent>
					</SidebarGroup>

					<SidebarGroup>
						<SidebarGroupLabel>Transactions</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarNavLinks items={transactionNavigation} />
						</SidebarGroupContent>
					</SidebarGroup>
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
					<header className="sticky top-0 z-20 -mx-3 mb-5 flex items-start justify-between gap-3 border-b border-border/70 bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:-mx-6 sm:px-6 md:-mx-8 md:mb-6 md:px-8 lg:-mx-10 lg:px-10">
						<div>
							<h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">
								{title}
							</h1>
							{description ? (
								<p className="mt-1 text-sm text-muted-foreground">
									{description}
								</p>
							) : null}
						</div>
						<SidebarTrigger className="h-10 w-10 shrink-0" />
					</header>
					{children}
				</section>
			</SidebarInset>
		</SidebarProvider>
	);
}
