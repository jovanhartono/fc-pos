import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { FilterCountBadge } from "@/components/filter-count-badge";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	type ORDER_STATUS_VALUES,
	OrderStatusTabs,
} from "@/features/orders/components/order-status-tabs";
import { StoreSelect } from "@/features/orders/components/store-select";
import { paymentMethodsQueries } from "@/features/payment-methods/api";
import { formatPaymentStatus, formatRefundStatus } from "@/lib/status";

export const PAYMENT_STATUS_VALUES = ["paid", "unpaid"] as const;

export const REFUND_STATUS_VALUES = ["any", "partial", "full"] as const;

export const NOTIFIED_VALUES = ["yes", "no"] as const;

type OrderStatusFilter = (typeof ORDER_STATUS_VALUES)[number];
type PaymentStatusFilter = (typeof PAYMENT_STATUS_VALUES)[number];
type RefundStatusFilter = (typeof REFUND_STATUS_VALUES)[number];
type NotifiedFilter = (typeof NOTIFIED_VALUES)[number];

export interface OrderFilterValues {
	search?: string;
	storeId?: number;
	status?: OrderStatusFilter;
	paymentStatus?: PaymentStatusFilter;
	paymentMethodId?: number;
	refundStatus?: RefundStatusFilter;
	notified?: NotifiedFilter;
	dateFrom?: string;
	dateTo?: string;
}

interface OrderFiltersProps {
	values: OrderFilterValues;
	role?: string;
	userStoreIds: number[];
	onChange: (patch: Partial<OrderFilterValues>) => void;
}

// "" clears the filter and shows the filter's name: "All refunds" read as
// "only refunded Orders".
const PAYMENT_ITEMS: Record<string, string> = {
	"": "Payment status",
	paid: formatPaymentStatus("paid"),
	unpaid: formatPaymentStatus("unpaid"),
};

const REFUND_ITEMS: Record<string, string> = {
	"": "Refund status",
	any: "Any refund",
	partial: formatRefundStatus("partial"),
	full: formatRefundStatus("full"),
};

const NOTIFIED_ITEMS: Record<string, string> = {
	"": "Pickup notice",
	yes: "Notified",
	no: "Not notified",
};

const METHOD_PLACEHOLDER = "Payment method";

interface FilterControlsProps extends OrderFiltersProps {
	idPrefix: string;
	isStacked?: boolean;
}

const FilterControls = ({
	values,
	role,
	userStoreIds,
	onChange,
	idPrefix,
	isStacked,
}: FilterControlsProps) => {
	const paymentMethodsQuery = useQuery(paymentMethodsQueries.list());
	// Inactive methods stay listed: old Orders were still paid with them.
	const methodItems = [
		{ value: "", label: METHOD_PLACEHOLDER },
		...(paymentMethodsQuery.data ?? []).map((method) => ({
			value: String(method.id),
			label: method.name,
		})),
	];

	return (
		<>
			<StoreSelect
				id={`${idPrefix}-store`}
				hideLabel
				value={values.storeId?.toString() ?? ""}
				onValueChange={(value) =>
					onChange({ storeId: value ? Number(value) : undefined })
				}
				allowedStoreIds={role === "admin" ? undefined : userStoreIds}
				allOptionLabel={role === "admin" ? "All stores" : undefined}
				placeholder="Filter by store"
				triggerClassName={isStacked ? undefined : "w-60"}
			/>
			<SelectField
				id={`${idPrefix}-payment`}
				aria-label="Filter by payment status"
				items={PAYMENT_ITEMS}
				value={values.paymentStatus ?? ""}
				onValueChange={(value) =>
					onChange({
						paymentStatus: (value || undefined) as PaymentStatusFilter,
					})
				}
				placeholder={PAYMENT_ITEMS[""]}
				className="w-full data-placeholder:text-foreground lg:w-max lg:min-w-40"
			/>
			<SelectField
				id={`${idPrefix}-payment-method`}
				aria-label="Filter by payment method"
				items={methodItems}
				value={values.paymentMethodId?.toString() ?? ""}
				onValueChange={(value) =>
					onChange({ paymentMethodId: value ? Number(value) : undefined })
				}
				placeholder={METHOD_PLACEHOLDER}
				className="w-full data-placeholder:text-foreground lg:w-max lg:min-w-40"
			/>
			<SelectField
				id={`${idPrefix}-refund`}
				aria-label="Filter by refund"
				items={REFUND_ITEMS}
				value={values.refundStatus ?? ""}
				onValueChange={(value) =>
					onChange({ refundStatus: (value || undefined) as RefundStatusFilter })
				}
				placeholder={REFUND_ITEMS[""]}
				className="w-full data-placeholder:text-foreground lg:w-max lg:min-w-40"
			/>
			<SelectField
				id={`${idPrefix}-notified`}
				aria-label="Filter by pickup notice"
				items={NOTIFIED_ITEMS}
				value={values.notified ?? ""}
				onValueChange={(value) =>
					onChange({ notified: (value || undefined) as NotifiedFilter })
				}
				placeholder={NOTIFIED_ITEMS[""]}
				className="w-full data-placeholder:text-foreground lg:w-max lg:min-w-40"
			/>
			<DateRangePicker
				id={`${idPrefix}-date`}
				resetOnSelect
				commitOnComplete
				from={values.dateFrom}
				to={values.dateTo}
				onChange={({ from, to }) => onChange({ dateFrom: from, dateTo: to })}
				onClear={() => onChange({ dateFrom: undefined, dateTo: undefined })}
				fullWidth={isStacked}
				placeholder="Created date"
				className="text-foreground"
			/>
		</>
	);
};

export const OrderFilters = ({
	values,
	role,
	userStoreIds,
	onChange,
}: OrderFiltersProps) => {
	const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
	const isAdmin = role === "admin";

	// Every filter hidden behind this button is counted here and cleared by
	// Clear all, or a shared link leaves a short list with nothing on screen
	// explaining it. Status is not here: its tabs are always on screen.
	const activeCount =
		(values.paymentStatus ? 1 : 0) +
		(values.paymentMethodId ? 1 : 0) +
		(values.refundStatus ? 1 : 0) +
		(values.notified ? 1 : 0) +
		(values.dateFrom || values.dateTo ? 1 : 0) +
		(isAdmin && values.storeId ? 1 : 0);

	const handleClearAll = () => {
		onChange({
			paymentStatus: undefined,
			paymentMethodId: undefined,
			refundStatus: undefined,
			notified: undefined,
			dateFrom: undefined,
			dateTo: undefined,
			...(isAdmin ? { storeId: undefined } : {}),
		});
	};

	// One search box moved by the grid, not a second copy beside the tabs: "/"
	// focuses the first one in the list, which would be the hidden one.
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
			<div className="col-span-2 min-w-0 lg:col-span-1">
				<OrderStatusTabs
					value={values.status}
					onValueChange={(status) => onChange({ status })}
				/>
			</div>

			<DebouncedSearchInput
				id="orders-search"
				value={values.search ?? ""}
				onDebouncedChange={(next) => onChange({ search: next || undefined })}
				placeholder="Order ID, customer, phone"
				ariaLabel="Search orders"
				className="min-w-0"
			/>

			<div className="lg:hidden">
				<Dialog open={isMobileFilterOpen} onOpenChange={setIsMobileFilterOpen}>
					<DialogTrigger
						render={
							<Button
								aria-label="Filters"
								type="button"
								variant="outline"
								size="icon"
								className="relative"
								icon={<HugeiconsIcon icon={FilterIcon} className="size-4" />}
							/>
						}
					>
						{activeCount > 0 ? <FilterCountBadge count={activeCount} /> : null}
					</DialogTrigger>
					<DialogContent className="gap-5">
						<DialogHeader>
							<DialogTitle>Filters</DialogTitle>
						</DialogHeader>
						<div className="grid gap-4">
							<FilterControls
								idPrefix="orders-mobile"
								isStacked
								values={values}
								role={role}
								userStoreIds={userStoreIds}
								onChange={onChange}
							/>
							<div className="flex gap-2">
								<Button
									type="button"
									variant="outline"
									className="h-10 flex-1"
									disabled={activeCount === 0}
									onClick={handleClearAll}
								>
									Clear All
								</Button>
								<Button
									type="button"
									className="h-10 flex-1"
									onClick={() => setIsMobileFilterOpen(false)}
								>
									Done
								</Button>
							</div>
						</div>
					</DialogContent>
				</Dialog>
			</div>

			<div className="col-span-2 hidden lg:flex lg:flex-wrap lg:items-center lg:gap-2">
				<FilterControls
					idPrefix="orders-desktop"
					values={values}
					role={role}
					userStoreIds={userStoreIds}
					onChange={onChange}
				/>
			</div>
		</div>
	);
};
