import {
	MagnifyingGlassIcon,
	ReceiptIcon,
	UserIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type NavigateOptions, useNavigate } from "@tanstack/react-router";
import {
	type ComponentType,
	type KeyboardEvent,
	useEffect,
	useState,
} from "react";
import {
	HOME_NAV_ITEM,
	navGroupsForRole,
	type Role,
} from "@/components/app-navigation";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { customersQueries } from "@/features/customers/api";
import { ordersQueries } from "@/features/orders/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatOrderStatus, getOrderStatusBadgeVariant } from "@/lib/status";
import { cn } from "@/lib/utils";

interface CommandBarProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	role?: Role;
}

interface CommandResult {
	key: string;
	group: "Pages" | "Customers" | "Orders";
	icon: ComponentType<{ className?: string }>;
	label: string;
	meta?: string;
	status?: Parameters<typeof formatOrderStatus>[0];
	target: NavigateOptions;
}

const MIN_SEARCH_LENGTH = 2;
const RESULT_LIMIT = 5;

// One box for "where is that pair": a returning customer at the counter reads
// out their phone, the cashier types four digits and lands on the Order.
// Pages are listed too, so it doubles as the way to jump anywhere.
export const CommandBar = ({ open, onOpenChange, role }: CommandBarProps) => {
	const navigate = useNavigate();
	const isWide = !useIsMobile(1024);
	const [query, setQuery] = useState("");
	const [term, setTerm] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);

	useEffect(() => {
		// Cashiers say a phone as 0812…; it is stored as +62812….
		const timer = setTimeout(() => {
			const trimmed = query.trim();
			setTerm(/^0\d+$/.test(trimmed) ? `+62${trimmed.slice(1)}` : trimmed);
		}, 200);
		return () => clearTimeout(timer);
	}, [query]);

	const canSearch = open && term.length >= MIN_SEARCH_LENGTH;
	const ordersQuery = useQuery({
		...ordersQueries.list({ search: term, limit: RESULT_LIMIT }),
		enabled: canSearch,
	});
	const customersQuery = useQuery({
		...customersQueries.list({ search: term, limit: RESULT_LIMIT }),
		enabled: canSearch,
	});

	const lowered = query.trim().toLowerCase();
	const pages: CommandResult[] = role
		? [HOME_NAV_ITEM, ...navGroupsForRole(role).flatMap((group) => group.items)]
				.filter((item) => item.label.toLowerCase().includes(lowered))
				.map((item) => ({
					key: `page-${item.label}`,
					group: "Pages",
					icon: item.icon,
					label: item.label,
					meta: item.description,
					target: { to: item.to },
				}))
		: [];

	const customers: CommandResult[] = canSearch
		? (customersQuery.data?.items ?? []).map((customer) => ({
				key: `customer-${customer.id}`,
				group: "Customers",
				icon: UserIcon,
				label: customer.name,
				meta: customer.phone_number,
				// The customer page is admin-only (ADR-0021); everyone else gets
				// that customer's Orders.
				target:
					role === "admin"
						? {
								to: "/customers/$customerId",
								params: { customerId: String(customer.id) },
								search: { page: 1 },
							}
						: {
								to: "/orders",
								search: { page: 1, search: customer.phone_number },
							},
			}))
		: [];

	const orders: CommandResult[] = canSearch
		? (ordersQuery.data?.items ?? []).map((order) => ({
				key: `order-${order.id}`,
				group: "Orders",
				icon: ReceiptIcon,
				label: order.code,
				meta: order.customer_name,
				status: order.status,
				// On a desktop the Order opens beside the list; on a phone, as its
				// own page.
				target: isWide
					? { to: "/orders", search: { page: 1, open: order.id } }
					: { to: "/orders/$orderId", params: { orderId: String(order.id) } },
			}))
		: [];

	const results = [...customers, ...orders, ...pages];
	const safeIndex = Math.min(activeIndex, Math.max(results.length - 1, 0));

	const handleOpenChange = (next: boolean) => {
		if (!next) {
			setQuery("");
			setTerm("");
			setActiveIndex(0);
		}
		onOpenChange(next);
	};

	const handleSelect = (result: CommandResult) => {
		handleOpenChange(false);
		void navigate(result.target);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			setActiveIndex(
				(safeIndex + step + results.length) % Math.max(results.length, 1),
			);
			return;
		}
		const active = results[safeIndex];
		if (event.key === "Enter" && active) {
			event.preventDefault();
			handleSelect(active);
		}
	};

	const isSearching =
		canSearch && (ordersQuery.isFetching || customersQuery.isFetching);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			{/* Its own frame, not the shared dialog: a search box with results
			    under it has no title, body or footer to fill. */}
			<DialogContent
				showCloseButton={false}
				className="top-[12vh] translate-y-0 gap-0 p-0 sm:max-w-xl max-sm:top-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:content-start"
			>
				<DialogTitle className="sr-only">Search or jump to</DialogTitle>
				<label className="flex h-13 items-center gap-3 border-b px-4">
					<MagnifyingGlassIcon className="size-4.5 shrink-0 text-muted-foreground" />
					<input
						autoFocus
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setActiveIndex(0);
						}}
						onKeyDown={handleKeyDown}
						placeholder="Phone, name, Order code or page"
						aria-label="Search or jump to"
						className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
					/>
					<kbd className="border border-b-2 px-1.5 font-mono text-[11px] text-muted-foreground max-sm:hidden">
						esc
					</kbd>
					<button
						type="button"
						onClick={() => handleOpenChange(false)}
						className="text-sm sm:hidden"
					>
						Cancel
					</button>
				</label>

				<div className="max-h-[60vh] overflow-y-auto py-1 max-sm:max-h-none">
					{results.length === 0 ? (
						<p className="px-4 py-6 text-center text-muted-foreground text-sm">
							{isSearching ? "Searching…" : "Nothing matches."}
						</p>
					) : (
						(["Customers", "Orders", "Pages"] as const).map((group) => {
							const groupResults = results.filter(
								(result) => result.group === group,
							);
							if (groupResults.length === 0) {
								return null;
							}
							return (
								<section key={group} className="py-1">
									<h3 className="px-4 pt-1.5 pb-1 text-muted-foreground text-xs">
										{group}
									</h3>
									<ul>
										{groupResults.map((result) => {
											const isActive = results[safeIndex] === result;
											const Icon = result.icon;
											return (
												<li key={result.key}>
													<button
														type="button"
														onClick={() => handleSelect(result)}
														onMouseMove={() =>
															setActiveIndex(results.indexOf(result))
														}
														className={cn(
															"flex h-10 w-full items-center gap-3 px-4 text-left text-sm max-sm:h-12",
															isActive && "bg-foreground text-background",
														)}
													>
														<Icon
															className={cn(
																"size-4 shrink-0",
																isActive
																	? "text-background/70"
																	: "text-muted-foreground",
															)}
														/>
														<span
															className={cn(
																"shrink-0 font-medium",
																result.group === "Orders" && "font-mono",
															)}
														>
															{result.label}
														</span>
														{result.meta ? (
															<span
																className={cn(
																	"min-w-0 truncate text-xs tabular-nums",
																	isActive
																		? "text-background/70"
																		: "text-muted-foreground",
																)}
															>
																{result.meta}
															</span>
														) : null}
														{result.status ? (
															<Badge
																className="ml-auto"
																variant={getOrderStatusBadgeVariant(
																	result.status,
																)}
															>
																{formatOrderStatus(result.status)}
															</Badge>
														) : null}
													</button>
												</li>
											);
										})}
									</ul>
								</section>
							);
						})
					)}
				</div>

				<div className="flex items-center gap-4 border-t px-4 py-2 text-muted-foreground text-xs max-sm:hidden">
					<span>↑ ↓ move</span>
					<span>↵ open</span>
					<span>esc close</span>
				</div>
			</DialogContent>
		</Dialog>
	);
};
