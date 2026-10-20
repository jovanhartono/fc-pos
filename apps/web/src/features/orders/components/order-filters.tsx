import { FunnelIcon } from "@phosphor-icons/react";
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
import { StoreSelect } from "@/features/orders/components/store-select";
import { formatPaymentStatus } from "@/lib/status";

export const ORDER_STATUS_VALUES = [
	"created",
	"processing",
	"ready_for_pickup",
	"completed",
	"cancelled",
] as const;

export const PAYMENT_STATUS_VALUES = ["paid", "unpaid"] as const;

export const NOTIFIED_VALUES = ["yes", "no"] as const;

type OrderStatusFilter = (typeof ORDER_STATUS_VALUES)[number];
type PaymentStatusFilter = (typeof PAYMENT_STATUS_VALUES)[number];
type NotifiedFilter = (typeof NOTIFIED_VALUES)[number];

export interface OrderFilterValues {
	search?: string;
	storeId?: number;
	status?: OrderStatusFilter;
	paymentStatus?: PaymentStatusFilter;
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

// "" is the all-payments sentinel — selecting it maps back to undefined. Status
// is not here: it has its own row of tabs above the filters.
const PAYMENT_ITEMS: Record<string, string> = {
	"": "All payments",
	paid: formatPaymentStatus("paid"),
	unpaid: formatPaymentStatus("unpaid"),
};

const NOTIFIED_ITEMS: Record<string, string> = {
	"": "All notices",
	yes: "Notified",
	no: "Not notified",
};

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
}: FilterControlsProps) => (
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
				onChange({ paymentStatus: (value || undefined) as PaymentStatusFilter })
			}
			placeholder="All payments"
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
			placeholder="All notices"
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
		/>
	</>
);

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
		(values.notified ? 1 : 0) +
		(values.dateFrom || values.dateTo ? 1 : 0) +
		(isAdmin && values.storeId ? 1 : 0);

	const handleClearAll = () => {
		onChange({
			paymentStatus: undefined,
			notified: undefined,
			dateFrom: undefined,
			dateTo: undefined,
			...(isAdmin ? { storeId: undefined } : {}),
		});
	};

	return (
		<div className="flex items-center gap-2 lg:flex-wrap">
			<DebouncedSearchInput
				id="orders-search"
				value={values.search ?? ""}
				onDebouncedChange={(next) => onChange({ search: next || undefined })}
				placeholder="Order ID, customer, phone"
				ariaLabel="Search orders"
				className="min-w-0 flex-1 lg:w-72 lg:flex-none"
			/>

			<div className="hidden lg:flex lg:flex-wrap lg:items-center lg:gap-2">
				<FilterControls
					idPrefix="orders-desktop"
					values={values}
					role={role}
					userStoreIds={userStoreIds}
					onChange={onChange}
				/>
			</div>

			<div className="shrink-0 lg:hidden">
				<Dialog open={isMobileFilterOpen} onOpenChange={setIsMobileFilterOpen}>
					<DialogTrigger
						render={
							<Button
								aria-label="Filters"
								type="button"
								variant="outline"
								className="relative size-9 rounded-full border-0 bg-secondary hover:bg-muted-foreground/20 pointer-coarse:size-11"
								icon={<FunnelIcon className="size-4" />}
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
									Clear all
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
		</div>
	);
};
