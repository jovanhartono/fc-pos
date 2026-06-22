import { FunnelIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { DebouncedSearchInput } from "@/components/debounced-search-input";
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
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import { formatOrderStatus, formatPaymentStatus } from "@/lib/status";

export const ORDER_STATUS_VALUES = [
	"created",
	"processing",
	"ready_for_pickup",
	"completed",
	"cancelled",
] as const;

export const PAYMENT_STATUS_VALUES = ["paid", "unpaid"] as const;

type OrderStatusFilter = (typeof ORDER_STATUS_VALUES)[number];
type PaymentStatusFilter = (typeof PAYMENT_STATUS_VALUES)[number];

export interface OrderFilterValues {
	search?: string;
	storeId?: number;
	status?: OrderStatusFilter;
	paymentStatus?: PaymentStatusFilter;
	dateFrom?: string;
	dateTo?: string;
}

interface OrderFiltersProps {
	values: OrderFilterValues;
	role?: string;
	userStoreIds: number[];
	onChange: (patch: Partial<OrderFilterValues>) => void;
}

// "" is the all-stores/statuses sentinel — selecting it maps back to undefined.
const STATUS_ITEMS: Record<string, string> = {
	"": "All statuses",
	created: formatOrderStatus("created"),
	processing: formatOrderStatus("processing"),
	ready_for_pickup: formatOrderStatus("ready_for_pickup"),
	completed: formatOrderStatus("completed"),
	cancelled: formatOrderStatus("cancelled"),
};

const PAYMENT_ITEMS: Record<string, string> = {
	"": "All payments",
	paid: formatPaymentStatus("paid"),
	unpaid: formatPaymentStatus("unpaid"),
};

interface FilterControlsProps extends OrderFiltersProps {
	idPrefix: string;
}

const FilterControls = ({
	values,
	role,
	userStoreIds,
	onChange,
	idPrefix,
}: FilterControlsProps) => (
	<>
		<StoreAutocomplete
			id={`${idPrefix}-store`}
			hideLabel
			value={values.storeId?.toString() ?? ""}
			onValueChange={(value) =>
				onChange({ storeId: value ? Number(value) : undefined })
			}
			allowedStoreIds={role === "admin" ? undefined : userStoreIds}
			allOptionLabel={role === "admin" ? "All stores" : undefined}
			placeholder="Filter by store"
			triggerClassName="h-10 w-full lg:w-max lg:min-w-40"
		/>
		<SelectField
			id={`${idPrefix}-status`}
			aria-label="Filter by order status"
			items={STATUS_ITEMS}
			value={values.status ?? ""}
			onValueChange={(value) =>
				onChange({ status: (value || undefined) as OrderStatusFilter })
			}
			placeholder="All statuses"
			className="w-full lg:w-max lg:min-w-40"
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
			className="w-full lg:w-max lg:min-w-40"
		/>
		<DateRangePicker
			id={`${idPrefix}-date`}
			resetOnSelect
			commitOnComplete
			from={values.dateFrom}
			to={values.dateTo}
			onChange={({ from, to }) => onChange({ dateFrom: from, dateTo: to })}
			onClear={() => onChange({ dateFrom: undefined, dateTo: undefined })}
			className="w-full lg:w-max"
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

	const activeCount =
		(values.status ? 1 : 0) +
		(values.paymentStatus ? 1 : 0) +
		(values.dateFrom || values.dateTo ? 1 : 0) +
		(isAdmin && values.storeId ? 1 : 0);

	const handleClearAll = () => {
		onChange({
			status: undefined,
			paymentStatus: undefined,
			dateFrom: undefined,
			dateTo: undefined,
			...(isAdmin ? { storeId: undefined } : {}),
		});
	};

	return (
		<div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
			<DebouncedSearchInput
				id="orders-search"
				value={values.search ?? ""}
				onDebouncedChange={(next) => onChange({ search: next || undefined })}
				placeholder="Order ID, customer, phone"
				ariaLabel="Search orders"
				className="w-full lg:w-72"
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

			<div className="lg:hidden">
				<Dialog open={isMobileFilterOpen} onOpenChange={setIsMobileFilterOpen}>
					<DialogTrigger
						render={
							<Button
								type="button"
								variant="outline"
								className="h-10 w-full"
								icon={<FunnelIcon className="size-4" />}
							/>
						}
					>
						{activeCount > 0 ? `Filters (${activeCount})` : "Filters"}
					</DialogTrigger>
					<DialogContent className="gap-5">
						<DialogHeader>
							<DialogTitle>Filters</DialogTitle>
						</DialogHeader>
						<div className="grid gap-4">
							<FilterControls
								idPrefix="orders-mobile"
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
