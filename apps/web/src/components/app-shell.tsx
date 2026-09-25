import {
	ArrowClockwiseIcon,
	CaretLeftIcon,
	MonitorIcon,
	MoonIcon,
	SignOutIcon,
	SunIcon,
} from "@phosphor-icons/react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Link,
	type LinkProps,
	useCanGoBack,
	useNavigate,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
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

// Installed to a home screen there is no address bar to reload from, and
// pull-to-refresh is off so an overscroll cannot reload mid-order. This is the
// one way a cashier can say "show me what the counter actually has".
const HeaderRefreshButton = () => {
	const queryClient = useQueryClient();
	const isFetching = useIsFetching() > 0;

	return (
		<Button
			aria-label="Refresh"
			className="ml-auto"
			icon={
				<ArrowClockwiseIcon
					className={cn(
						"size-4",
						isFetching && "animate-spin motion-reduce:animate-none",
					)}
				/>
			}
			onClick={() => queryClient.invalidateQueries()}
			size="icon-lg"
			variant="ghost"
		/>
	);
};

// Every record in this app hangs off the list named by its first path segment —
// /orders/42 off /orders, /queue/7/3 off /queue. Installed to a home screen the
// only other way out is the edge swipe, which on iOS redraws the whole page.
const useParentPath = (): LinkProps["to"] | null => {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const segments = pathname.split("/").filter(Boolean);

	if (segments.length < 2) {
		return null;
	}

	return `/${segments[0]}` as LinkProps["to"];
};

// Stepping back through history hands the cashier the list exactly as they left
// it — store, status, page, scroll — because that browser entry still holds the
// filtered URL. A link to the parent path would drop all of it. Arriving from a
// tracking link or a fresh tab there is nothing to step back to, so those land
// on the unfiltered list instead.
const HeaderBackButton = ({ to }: { to: LinkProps["to"] }) => {
	const router = useRouter();
	const canGoBack = useCanGoBack();
	const icon = <CaretLeftIcon className="size-5" />;

	if (canGoBack) {
		return (
			<Button
				aria-label="Back"
				icon={icon}
				onClick={() => router.history.back()}
				size="icon-lg"
				variant="ghost"
			/>
		);
	}

	return (
		<Button
			aria-label="Back"
			icon={icon}
			render={<Link to={to} />}
			size="icon-lg"
			variant="ghost"
		/>
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
	const parentPath = useParentPath();

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
				{/* No sidebar button up here: the tab bar's More opens the same sheet,
				    and one of the two was always the wrong one to reach for. */}
				<div className="flex shrink-0 items-center border-b border-sidebar-border/70 bg-background px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:hidden">
					{parentPath ? (
						<HeaderBackButton to={parentPath} />
					) : (
						<Link to="/" aria-label="Home">
							<BrandLogo className="h-8" />
						</Link>
					)}
					<HeaderRefreshButton />
				</div>
				{/* Queue detail's Hold to Start Work bar rests on the window bottom
				    (the tab bar below md); a sticky bar would stop short of this padding. */}
				<section
					className="flex-1 overflow-y-auto overflow-x-clip overscroll-contain px-3 py-4 pb-[calc(var(--inset-bottom)+1rem)] has-[[data-bottom-bar]]:pb-0 sm:px-6 sm:py-5 md:px-8 md:py-6 lg:px-10"
					data-scroll-restoration-id={APP_CONTENT_SCROLL_ID}
				>
					{children}
				</section>
				{tabBarItems.length > 0 ? <AppTabBar items={tabBarItems} /> : null}
			</SidebarInset>
		</SidebarProvider>
	);
}
