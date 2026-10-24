import {
	ArrowLeft01Icon,
	ComputerIcon,
	Logout03Icon,
	Moon02Icon,
	ReloadIcon,
	Search01Icon,
	Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { BrandLogo } from "@/components/brand-logo";
import { useOpenCommandBar } from "@/components/command-bar";
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
								<HugeiconsIcon
									icon={Sun03Icon}
									className="absolute inset-0 size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
								/>
								<HugeiconsIcon
									icon={Moon02Icon}
									className="absolute inset-0 size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
								/>
							</span>
						}
					/>
				}
			/>
			<DropdownMenuContent align="end" side="top">
				<DropdownMenuItem onClick={() => setTheme("light")}>
					<HugeiconsIcon icon={Sun03Icon} className="size-4" />
					Light
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("dark")}>
					<HugeiconsIcon icon={Moon02Icon} className="size-4" />
					Dark
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("system")}>
					<HugeiconsIcon icon={ComputerIcon} className="size-4" />
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
			icon={
				<HugeiconsIcon
					icon={ReloadIcon}
					className={cn(
						"size-4",
						isFetching && "animate-spin motion-reduce:animate-none",
					)}
				/>
			}
			onClick={() => queryClient.invalidateQueries()}
			size="icon"
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

// Going back hands the cashier the list as they left it (Store, status, page,
// scroll); a link to the parent would drop all that. Opened from a tracking link
// or a fresh tab there is no history, so they land on the unfiltered list.
const HeaderBackButton = ({ to }: { to: LinkProps["to"] }) => {
	const router = useRouter();
	const canGoBack = useCanGoBack();
	const icon = <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />;

	if (canGoBack) {
		return (
			<Button
				aria-label="Back"
				icon={icon}
				onClick={() => router.history.back()}
				size="icon"
				variant="ghost"
			/>
		);
	}

	return (
		<Button
			aria-label="Back"
			icon={icon}
			nativeButton={false}
			render={<Link to={to} />}
			size="icon"
			variant="ghost"
		/>
	);
};

function SidebarNavLinks({ items }: { items: readonly NavItem[] }) {
	const { openMobile, closeMobileThen } = useSidebar();
	const navigate = useNavigate();

	return (
		<SidebarMenu>
			{items.map((item) => (
				<SidebarMenuItem key={item.to}>
					<SidebarMenuButton
						render={
							<Link
								to={item.to}
								className="text-foreground"
								onClick={(event) => {
									if (!openMobile) {
										return;
									}
									// Safari keeps a picture of each page for swipe back; leaving
									// while More was still closing kept the sheet in that picture.
									event.preventDefault();
									closeMobileThen(() => navigate({ to: item.to }));
								}}
								activeProps={{
									"data-active": "true",
									className: "text-foreground",
								}}
							/>
						}
						tooltip={item.label}
					>
						<HugeiconsIcon className="size-4" icon={item.icon} />
						<span>{item.label}</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
			))}
		</SidebarMenu>
	);
}

export function AppShell({ title, children }: AppShellProps) {
	const navigate = useNavigate();
	const clearToken = useAuthStore((state) => state.clearToken);
	const user = getCurrentUser();
	// Read once on purpose: following the window width re-rendered the whole shell
	// mid-resize and fought a cashier who had collapsed the sidebar by hand.
	const [startsCollapsed] = useState(() => window.innerWidth < 1280);
	// Nav visibility follows the DB-fresh role from /admin/users/me, not the
	// stale JWT claim — role changes apply without re-login.
	const meQuery = useQuery(usersQueries.me());
	const role = meQuery.data?.role;
	const parentPath = useParentPath();

	useEffect(() => {
		document.title = `${title} | Fresclean POS`;
	}, [title]);

	const openCommandBar = useOpenCommandBar();
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				openCommandBar();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [openCommandBar]);

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
			<Sidebar collapsible="icon" variant="sidebar">
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

				<div className="px-2 pt-2 group-data-[collapsible=icon]:hidden">
					<button
						type="button"
						onClick={openCommandBar}
						className="flex h-9 w-full items-center gap-2 rounded-sm bg-secondary px-2.5 text-muted-foreground text-subhead transition-colors hover:text-foreground"
					>
						<HugeiconsIcon icon={Search01Icon} className="size-4" />
						Search
					</button>
				</div>

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

				<SidebarFooter className="border-sidebar-border border-t">
					<div className="flex items-center gap-2.5 px-2 py-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-0">
						<div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
							<p className="truncate font-medium text-body leading-tight">
								{user?.name ?? "Unknown User"}
							</p>
							<p className="truncate text-subhead capitalize leading-tight">
								{role ?? "—"}
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-0.5 group-data-[collapsible=icon]:flex-col">
							<FooterThemeButton />
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Logout"
								onClick={handleLogout}
								icon={<HugeiconsIcon icon={Logout03Icon} className="size-4" />}
							/>
						</div>
					</div>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>

			<SidebarInset
				className={cn(
					// A table too wide for the window scrolls in its frame, not the page.
					"min-h-0 min-w-0",
					// Header and tab bar float over the page so it scrolls under the
					// frosted glass; these are the heights the page pads itself by.
					"max-md:[--app-header:calc(env(safe-area-inset-top)+3.25rem)] max-md:pointer-coarse:[--app-header:calc(env(safe-area-inset-top)+3.75rem)]",
					tabBarItems.length > 0 &&
						"max-md:[--inset-bottom:calc(env(safe-area-inset-bottom)+3.25rem)]",
				)}
			>
				{/* No sidebar button up here: the tab bar's More opens the same sheet,
				    and one of the two was always the wrong one to reach for. */}
				<div className="absolute inset-x-0 top-0 z-50 flex h-(--app-header) items-center bg-frost px-3 pt-[env(safe-area-inset-top)] shadow-[0_0.5px_0_var(--border)] backdrop-blur-xl backdrop-saturate-150 md:hidden">
					{parentPath ? (
						<HeaderBackButton to={parentPath} />
					) : (
						<Link to="/" aria-label="Home">
							<BrandLogo className="h-8" />
						</Link>
					)}
					<div className="ml-auto flex items-center gap-1">
						<Button
							aria-label="Search or jump to"
							variant="ghost"
							size="icon"
							icon={<HugeiconsIcon icon={Search01Icon} className="size-4" />}
							onClick={openCommandBar}
						/>
						<HeaderRefreshButton />
					</div>
				</div>
				{/* Queue detail's Hold to Start Work bar rests on the window bottom
				    (the tab bar below md); a sticky bar would stop short of this padding. */}
				<section
					className="flex-1 overflow-y-auto overflow-x-clip overscroll-contain [--page-top:0.75rem] [--page-x:0.75rem] px-(--page-x) pt-[calc(var(--app-header,0px)+var(--page-top))] pb-[calc(var(--inset-bottom)+0.75rem)] has-[[data-bottom-bar]]:pb-0 sm:[--page-top:1rem] sm:[--page-x:1rem] sm:pb-[calc(var(--inset-bottom)+1rem)] lg:[--page-x:1.5rem] has-[[data-list-panel]]:flex has-[[data-list-panel]]:flex-col"
					data-scroll-restoration-id={APP_CONTENT_SCROLL_ID}
				>
					{children}
				</section>
				{tabBarItems.length > 0 ? <AppTabBar items={tabBarItems} /> : null}
			</SidebarInset>
		</SidebarProvider>
	);
}
