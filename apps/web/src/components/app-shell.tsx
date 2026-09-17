import {
	MonitorIcon,
	MoonIcon,
	SignOutIcon,
	SunIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useState } from "react";
import {
	HOME_NAV_ITEM,
	type NavItem,
	navGroupsForRole,
	tabBarItemsForRole,
} from "@/components/app-navigation";
import { AppTabBar } from "@/components/app-tab-bar";
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
	useSidebar,
} from "@/components/ui/sidebar";
import { usersQueries } from "@/features/users/api";
import { cn } from "@/lib/utils";
import { getCurrentUser, useAuthStore } from "@/stores/auth-store";

interface AppShellProps extends PropsWithChildren {
	title: string;
}

// The one pane that scrolls. main.tsx points the router's scroll handling at it
// by this id, and a rename on one side only would quietly park every opened
// record halfway down the list it came from.
export const APP_CONTENT_SCROLL_ID = "app-content";

// The receipt logo is black type on a solid white block. Multiply hides the
// white on the light sidebar; invert plus screen does the same in dark mode.
const BrandLogo = ({ className }: { className?: string }) => (
	<img
		src="/receipt-logo.webp"
		alt="Fresclean"
		width={2000}
		height={632}
		className={cn(
			"w-auto mix-blend-multiply dark:invert dark:mix-blend-screen",
			className,
		)}
	/>
);

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
	const { setOpenMobile } = useSidebar();

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
									className="text-foreground"
									onClick={() => setOpenMobile(false)}
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
	// Read once, deliberately not tracked: this only seeds the sidebar's
	// defaultOpen, a state initializer nobody reads again. Following the
	// breakpoint afterwards re-rendered the whole shell mid-drag to change
	// nothing, and would fight a cashier who had collapsed the sidebar by hand.
	const [startsCollapsed] = useState(() => window.innerWidth < 1280);
	// Nav visibility follows the DB-fresh role from /admin/users/me, not the
	// stale JWT claim — role changes apply without re-login.
	const meQuery = useQuery(usersQueries.me());
	const role = meQuery.data?.role;

	useEffect(() => {
		document.title = `${title} | Fresclean POS`;
	}, [title]);

	const handleLogout = () => {
		clearToken();
		void navigate({ to: "/auth/login" });
	};

	const allowedGroups = role ? navGroupsForRole(role) : [];
	const tabBarItems = role ? tabBarItemsForRole(role) : [];

	// The shell fills the viewport and only the content pane scrolls, so the
	// header and the tab bar stay put while a worker flicks through the queue
	// instead of sliding away with the page.
	return (
		<SidebarProvider
			className="h-full min-h-0 overflow-hidden"
			defaultOpen={!startsCollapsed}
		>
			<Sidebar collapsible="icon" variant="inset">
				<SidebarHeader className="flex-row items-center justify-between group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
					<Link to="/" className="flex items-center px-2" aria-label="Home">
						<BrandLogo className="h-10 group-data-[collapsible=icon]:hidden" />
						<img
							src="/favicon.svg"
							alt=""
							className="hidden size-6 dark:invert group-data-[collapsible=icon]:block"
						/>
					</Link>
					<SidebarTrigger className="size-6 shrink-0" />
				</SidebarHeader>

				<SidebarSeparator />

				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarNavLinks items={[HOME_NAV_ITEM]} />
						</SidebarGroupContent>
					</SidebarGroup>
					{allowedGroups.map((group) => (
						<SidebarGroup key={group.label}>
							<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarNavLinks items={group.items} />
							</SidebarGroupContent>
						</SidebarGroup>
					))}
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
							<span className="text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
								Role
							</span>
							<span className="font-semibold text-[10px] uppercase tracking-[0.18em]">
								{role ?? "—"}
							</span>
						</div>
					</div>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>

			<SidebarInset
				className={cn(
					"min-h-0",
					tabBarItems.length > 0 && "max-md:[--inset-bottom:0px]",
				)}
			>
				<div className="flex shrink-0 items-center gap-2 border-b border-sidebar-border/70 bg-background px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:hidden">
					<SidebarTrigger className="size-9" />
					<Link to="/" aria-label="Home">
						<BrandLogo className="h-8" />
					</Link>
				</div>
				<section
					className="flex-1 overflow-y-auto overflow-x-clip overscroll-contain px-3 py-4 pb-[calc(var(--inset-bottom)+1rem)] sm:px-6 sm:py-5 md:px-8 md:py-6 lg:px-10"
					data-scroll-restoration-id={APP_CONTENT_SCROLL_ID}
				>
					{children}
				</section>
				{tabBarItems.length > 0 ? <AppTabBar items={tabBarItems} /> : null}
			</SidebarInset>
		</SidebarProvider>
	);
}
