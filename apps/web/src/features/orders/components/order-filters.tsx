import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DebouncedSearchInput } from "@/components/debounced-search-input";
import {
	dateRangeLabel,
	type FilterChip,
	FilterChips,
} from "@/components/filter-chips";
import { FilterPanel } from "@/components/filter-panel";
import { SelectField } from "@/components/form/select-field";
import { SegmentedFilter } from "@/components/segmented-filter";
import { DateRangePicker } from "@/components/ui/date-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	type ORDER_STATUS_VALUES,
	OrderStatusTabs,
} from "@/features/orders/components/order-status-tabs";
import { StoreSelect } from "@/features/orders/components/store-select";
import { paymentMethodsQueries } from "@/features/payment-methods/api";
import { storesQueries } from "@/features/stores/api";
import { formatPaymentStatus } from "@/lib/status";

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
	paidFrom?: string;
	paidTo?: string;
}

interface OrderFiltersProps {
	values: OrderFilterValues;
	role?: string;
	userStoreIds: number[];
	onChange: (patch: Partial<OrderFilterValues>) => void;
}

const ALL = "all";

const PAYMENT_OPTIONS = [
	[ALL, "All"],
	["paid", formatPaymentStatus("paid")],
	["unpaid", formatPaymentStatus("unpaid")],
] as const;

// Short words, not the status names: four segments must fit a phone, and the
// field is already labelled Refund.
const REFUND_OPTIONS = [
	[ALL, "All"],
	["any", "Any"],
	["partial", "Partial"],
	["full", "Full"],
] as const;

const NOTIFIED_OPTIONS = [
	[ALL, "All"],
	["no", "Not notified"],
	["yes", "Notified"],
] as const;

const optionLabel = (
	options: readonly (readonly [string, string])[],
	value: string,
) => options.find(([optionValue]) => optionValue === value)?.[1] ?? value;

interface FilterFieldProps {
	id: string;
	label: string;
	children: ReactNode;
}

const FilterField = ({ id, label, children }: FilterFieldProps) => (
	<Field>
		<FieldLabel htmlFor={id}>{label}</FieldLabel>
		{children}
	</Field>
);

const idPrefix = "orders-filter";

const FilterFields = ({
	values,
	role,
	userStoreIds,
	onChange,
}: OrderFiltersProps) => {
	const paymentMethodsQuery = useQuery(paymentMethodsQueries.list());
	// Inactive methods stay listed: old Orders were still paid with them.
	const methodItems = [
		{ value: "", label: "Any method" },
		...(paymentMethodsQuery.data ?? []).map((method) => ({
			value: String(method.id),
			label: method.name,
		})),
	];

	return (
		<div className="grid gap-4">
			<StoreSelect
				id={`${idPrefix}-store`}
				label="Store"
				value={values.storeId?.toString() ?? ""}
				onValueChange={(value) =>
					onChange({ storeId: value ? Number(value) : undefined })
				}
				allowedStoreIds={role === "admin" ? undefined : userStoreIds}
				allOptionLabel={role === "admin" ? "All stores" : undefined}
				placeholder="Select store"
			/>
			<FilterField id={`${idPrefix}-date`} label="Created date">
				<DateRangePicker
					id={`${idPrefix}-date`}
					resetOnSelect
					commitOnComplete
					from={values.dateFrom}
					to={values.dateTo}
					onChange={({ from, to }) => onChange({ dateFrom: from, dateTo: to })}
					onClear={() => onChange({ dateFrom: undefined, dateTo: undefined })}
					fullWidth
					placeholder="Any time"
				/>
			</FilterField>
			<FilterField id={`${idPrefix}-paid-date`} label="Paid date">
				<DateRangePicker
					id={`${idPrefix}-paid-date`}
					resetOnSelect
					commitOnComplete
					from={values.paidFrom}
					to={values.paidTo}
					onChange={({ from, to }) => onChange({ paidFrom: from, paidTo: to })}
					onClear={() => onChange({ paidFrom: undefined, paidTo: undefined })}
					fullWidth
					placeholder="Any time"
				/>
			</FilterField>
			<SegmentedFilter
				id={`${idPrefix}-payment`}
				label="Payment status"
				options={PAYMENT_OPTIONS}
				value={values.paymentStatus}
				onValueChange={(paymentStatus) => onChange({ paymentStatus })}
			/>
			<FilterField id={`${idPrefix}-payment-method`} label="Payment method">
				<SelectField
					id={`${idPrefix}-payment-method`}
					items={methodItems}
					value={values.paymentMethodId?.toString() ?? ""}
					onValueChange={(value) =>
						onChange({ paymentMethodId: value ? Number(value) : undefined })
					}
					placeholder="Any method"
					className="w-full data-placeholder:text-foreground"
				/>
			</FilterField>
			<SegmentedFilter
				id={`${idPrefix}-refund`}
				label="Refund"
				options={REFUND_OPTIONS}
				value={values.refundStatus}
				onValueChange={(refundStatus) => onChange({ refundStatus })}
			/>
			<SegmentedFilter
				id={`${idPrefix}-notified`}
				label="Pickup notice"
				options={NOTIFIED_OPTIONS}
				value={values.notified}
				onValueChange={(notified) => onChange({ notified })}
			/>
		</div>
	);
};

export const OrderFilters = ({
	values,
	role,
	userStoreIds,
	onChange,
}: OrderFiltersProps) => {
	const isAdmin = role === "admin";
	const storesQuery = useQuery(storesQueries.list());
	const paymentMethodsQuery = useQuery(paymentMethodsQueries.list());

	// Every filter hidden behind the button gets a chip, is counted on it and
	// is cleared by Clear All, or a shared link leaves a short list with nothing
	// on screen explaining it. Status is not here: its tabs are always on screen.
	// A cashier's own Store isn't either: it's the only one they can pick.
	const chipsFor = (v: OrderFilterValues): FilterChip[] => {
		const chips: FilterChip[] = [];
		if (isAdmin && v.storeId) {
			const store = storesQuery.data?.find((s) => s.id === v.storeId);
			chips.push({
				id: "store",
				label: `Store: ${store?.code ?? v.storeId}`,
				onRemove: () => onChange({ storeId: undefined }),
			});
		}
		if (v.dateFrom || v.dateTo) {
			chips.push({
				id: "created",
				label: `Created: ${dateRangeLabel(v.dateFrom, v.dateTo)}`,
				onRemove: () => onChange({ dateFrom: undefined, dateTo: undefined }),
			});
		}
		if (v.paidFrom || v.paidTo) {
			chips.push({
				id: "paid",
				label: `Paid: ${dateRangeLabel(v.paidFrom, v.paidTo)}`,
				onRemove: () => onChange({ paidFrom: undefined, paidTo: undefined }),
			});
		}
		if (v.paymentStatus) {
			chips.push({
				id: "payment",
				label: `Payment: ${optionLabel(PAYMENT_OPTIONS, v.paymentStatus)}`,
				onRemove: () => onChange({ paymentStatus: undefined }),
			});
		}
		if (v.paymentMethodId) {
			const method = paymentMethodsQuery.data?.find(
				(m) => m.id === v.paymentMethodId,
			);
			chips.push({
				id: "method",
				label: `Method: ${method?.name ?? v.paymentMethodId}`,
				onRemove: () => onChange({ paymentMethodId: undefined }),
			});
		}
		if (v.refundStatus) {
			chips.push({
				id: "refund",
				label: `Refund: ${optionLabel(REFUND_OPTIONS, v.refundStatus)}`,
				onRemove: () => onChange({ refundStatus: undefined }),
			});
		}
		if (v.notified) {
			chips.push({
				id: "notified",
				label: `Pickup notice: ${optionLabel(NOTIFIED_OPTIONS, v.notified)}`,
				onRemove: () => onChange({ notified: undefined }),
			});
		}
		return chips;
	};
	const chips = chipsFor(values);

	const clear = (v: OrderFilterValues): OrderFilterValues => ({
		paymentStatus: undefined,
		paymentMethodId: undefined,
		refundStatus: undefined,
		notified: undefined,
		dateFrom: undefined,
		dateTo: undefined,
		paidFrom: undefined,
		paidTo: undefined,
		storeId: isAdmin ? undefined : v.storeId,
	});

	// Only the panel's own fields, so Apply can't write back a page number or a
	// search typed while it was open.
	const panelValues: OrderFilterValues = {
		storeId: values.storeId,
		paymentStatus: values.paymentStatus,
		paymentMethodId: values.paymentMethodId,
		refundStatus: values.refundStatus,
		notified: values.notified,
		dateFrom: values.dateFrom,
		dateTo: values.dateTo,
		paidFrom: values.paidFrom,
		paidTo: values.paidTo,
	};

	const filters = (
		<FilterPanel
			value={panelValues}
			countOf={(v) => chipsFor(v).length}
			clear={clear}
			onApply={onChange}
		>
			{(draft, setDraft) => (
				<FilterFields
					values={draft}
					role={role}
					userStoreIds={userStoreIds}
					onChange={setDraft}
				/>
			)}
		</FilterPanel>
	);

	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-3 lg:grid-cols-[minmax(0,1fr)_auto_18rem]">
			<div className="col-span-2 min-w-0 lg:col-span-1">
				<OrderStatusTabs
					value={values.status}
					onValueChange={(status) => onChange({ status })}
				/>
			</div>
			{filters}
			<DebouncedSearchInput
				id="orders-search"
				value={values.search ?? ""}
				onDebouncedChange={(next) => onChange({ search: next || undefined })}
				placeholder="Order ID, customer, phone"
				ariaLabel="Search orders"
				className="min-w-0"
			/>
			{chips.length > 0 && (
				<FilterChips chips={chips} className="col-span-2 lg:col-span-3" />
			)}
		</div>
	);
};
