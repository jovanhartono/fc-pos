import { Autocomplete } from "@base-ui/react/autocomplete";
import {
	Invoice01Icon,
	Search01Icon,
	UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type NavigateOptions, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { HOME_NAV_ITEM, navGroupsForRole } from "@/components/app-navigation";
import { Badge } from "@/components/ui/badge";
import { customersQueries } from "@/features/customers/api";
import { ordersQueries } from "@/features/orders/api";
import { usersQueries } from "@/features/users/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatOrderStatus, getOrderStatusBadgeVariant } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useDialog } from "@/stores/dialog-store";

interface CommandResult {
	key: string;
	group: "Pages" | "Customers" | "Orders";
	icon: IconSvgElement;
	label: string;
	meta?: string;
	status?: Parameters<typeof formatOrderStatus>[0];
	target: NavigateOptions;
}

const MIN_SEARCH_LENGTH = 2;
const RESULT_LIMIT = 5;

// One box for "where is my Order": a returning customer at the counter reads
// out their phone, the cashier types four digits and lands on the Order.
// Pages are listed too, so it doubles as the way to jump anywhere.
const CommandBarPanel = () => {
	const navigate = useNavigate();
	const closeDialog = useDialog((state) => state.closeDialog);
	const role = useQuery(usersQueries.me()).data?.role;
	const isWide = !useIsMobile(1024);
	const [query, setQuery] = useState("");
	const [term, setTerm] = useState("");

	useEffect(() => {
		const timer = setTimeout(() => setTerm(query.trim()), 200);
		return () => clearTimeout(timer);
	}, [query]);

	const canSearch = term.length >= MIN_SEARCH_LENGTH;
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
				icon: Invoice01Icon,
				label: order.customer_name,
				meta: order.code,
				status: order.status,
				// On a desktop the Order opens in the sheet over the list; on a phone, as its
				// own page.
				target: isWide
					? { to: "/orders", search: { page: 1, open: order.id } }
					: { to: "/orders/$orderId", params: { orderId: String(order.id) } },
			}))
		: [];

	const groups = [
		{ value: "Customers", items: customers },
		{ value: "Orders", items: orders },
		{ value: "Pages", items: pages },
	].filter((group) => group.items.length > 0);

	const handleSelect = (result: CommandResult) => {
		closeDialog();
		void navigate(result.target);
	};

	const isSearching =
		canSearch && (ordersQuery.isFetching || customersQuery.isFetching);

	return (
		<Autocomplete.Root
			open
			inline
			items={groups}
			filter={null}
			autoHighlight="always"
			keepHighlight
			itemToStringValue={(result: CommandResult) => result.label}
			value={query}
			onValueChange={(value, details) => {
				// Picking a row would copy its label into the box and reshuffle the
				// list while the dialog fades out.
				if (details.reason !== "item-press") {
					setQuery(value);
				}
			}}
		>
			{/* biome-ignore lint/a11y/noLabelWithoutControl: Autocomplete.Input renders the input inside it */}
			<label className="flex h-13 items-center gap-3 border-b pr-12 pl-4">
				<HugeiconsIcon
					icon={Search01Icon}
					className="size-4.5 shrink-0 text-muted-foreground"
				/>
				<Autocomplete.Input
					autoFocus
					placeholder="Phone, name, Order code or page"
					aria-label="Search or jump to"
					className="h-full min-w-0 flex-1 bg-transparent text-field outline-none placeholder:text-muted-foreground"
				/>
			</label>

			{/* On a phone the keyboard takes the bottom half, so the list stops above it. */}
			<div className="max-h-[60vh] overflow-y-auto py-1 max-sm:max-h-[45dvh]">
				<Autocomplete.Empty>
					<p className="px-4 py-6 text-center text-muted-foreground text-body">
						{isSearching ? "Searching…" : "Nothing matches."}
					</p>
				</Autocomplete.Empty>
				<Autocomplete.List>
					{(group: (typeof groups)[number]) => (
						<Autocomplete.Group
							key={group.value}
							items={group.items}
							className="py-1"
						>
							<Autocomplete.GroupLabel className="px-4 pt-1.5 pb-1 text-muted-foreground text-footnote">
								{group.value}
							</Autocomplete.GroupLabel>
							<Autocomplete.Collection>
								{(result: CommandResult) => {
									const isOrder = result.group === "Orders";
									return (
										<Autocomplete.Item
											key={result.key}
											value={result}
											onClick={() => handleSelect(result)}
											className={cn(
												"group flex h-10 w-full items-center gap-3 px-4 text-left text-body data-highlighted:bg-primary/10 max-sm:h-12",
												isOrder && "h-14 max-sm:h-14",
											)}
										>
											<HugeiconsIcon
												icon={result.icon}
												className="size-4 shrink-0 text-muted-foreground group-data-highlighted:text-primary"
											/>
											{/* A cashier hunting an Order by phone scans for the
											    customer's name, so it leads and the code sits under it. */}
											<span
												className={cn(
													"flex min-w-0 gap-x-3",
													isOrder ? "flex-col" : "items-baseline",
												)}
											>
												<span className="shrink-0 truncate font-medium">
													{result.label}
												</span>
												{result.meta ? (
													<span
														className={cn(
															"min-w-0 truncate text-subhead tabular-nums",
															result.group === "Pages" &&
																"text-muted-foreground",
														)}
													>
														{result.meta}
													</span>
												) : null}
											</span>
											{result.status ? (
												<Badge
													className="ml-auto"
													variant={getOrderStatusBadgeVariant(result.status)}
												>
													{formatOrderStatus(result.status)}
												</Badge>
											) : null}
										</Autocomplete.Item>
									);
								}}
							</Autocomplete.Collection>
						</Autocomplete.Group>
					)}
				</Autocomplete.List>
			</div>
		</Autocomplete.Root>
	);
};

// Opens the bar in the shared dialog. Ignored while another dialog is up, so
// Cmd+K never throws away a half-filled confirm.
export const useOpenCommandBar = () => {
	const openDialog = useDialog((state) => state.openDialog);
	return useCallback(() => {
		if (useDialog.getState().dialogState.open) {
			return;
		}
		openDialog({
			content: () => <CommandBarPanel />,
			contentClassName:
				"top-[12vh] translate-y-0 gap-0 p-0 sm:max-w-xl [&>div]:py-0 max-sm:top-[calc(env(safe-area-inset-top)+0.75rem)]",
		});
	}, [openDialog]);
};
