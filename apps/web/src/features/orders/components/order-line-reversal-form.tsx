import { allocateRefund, lineKey } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import type { UseMutationResult } from "@tanstack/react-query";
import { Fragment, useMemo } from "react";
import {
	Controller,
	FormProvider,
	useFieldArray,
	useForm,
	useFormContext,
	useWatch,
} from "react-hook-form";
import { z } from "zod";
import { SelectField } from "@/components/form/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type {
	CancelOrderPayload,
	CreateOrderRefundPayload,
} from "@/features/orders/api";
import {
	reworkChoiceCaption,
	type WorkshopRework,
} from "@/features/orders/lib/refund-rework";
import {
	CANCEL_REASONS,
	formatCancelReason,
	formatRefundReason,
	REFUND_REASONS,
} from "@/lib/status";
import { formatMoney } from "@/shared/money";

// Cancel is the unpaid, per-line twin of refund (ADR-0008): one deep form —
// line picker, per-line reason/note, validation, submit — with a shallow
// config per off-ramp. The refund config additionally carries line caps to
// preview the exact amounts the server will book.

// Several treatments can share one tag now (ADR-0017), so the tag alone no
// longer tells two refundable lines apart — the treatment's name is what makes
// the row pickable. The pair's brand and model lead, since the cashier
// remembers "the white AF1", not "I001".
interface ReversalServiceOption {
	id: number;
	is_rework?: boolean;
	item_details: string | null;
	item_tag: string;
	service_name: string;
	// Refund only: the Rework round still in the workshop under this line.
	workshopRework?: WorkshopRework;
}

interface ReversalProductOption {
	id: number;
	name: string;
	qty: number;
}

type ReversalSubmitItem<R extends string> = (
	| { order_service_id: number }
	| { order_product_id: number }
) & {
	reason: R;
	note?: string;
	keep_rework?: boolean;
};

const buildReversalSchema = (verb: string, reasons: readonly string[]) =>
	z
		.object({
			items: z.array(
				z.object({
					id: z.number(),
					kind: z.enum(["service", "product"]),
					selected: z.boolean(),
					reason: z.enum(reasons as [string, ...string[]]),
					note: z.string().optional(),
					keep_rework: z.boolean(),
				}),
			),
		})
		.superRefine((data, ctx) => {
			const selectedCount = data.items.filter((item) => item.selected).length;
			if (selectedCount === 0) {
				ctx.addIssue({
					code: "custom",
					path: ["items"],
					message: `Select at least one item to ${verb}.`,
				});
			}
			for (const [index, item] of data.items.entries()) {
				if (
					item.selected &&
					item.reason === "other" &&
					!(item.note ?? "").trim()
				) {
					ctx.addIssue({
						code: "custom",
						path: ["items", index, "note"],
						message: "Add a note when the reason is Other",
					});
				}
			}
		});

type ReversalFormValues = z.infer<ReturnType<typeof buildReversalSchema>>;

interface ReversalCopy {
	verb: string;
	confirm: string;
	pending: string;
}

interface OrderLineReversalFormProps<R extends string> {
	closeDialog: () => void;
	copy: ReversalCopy;
	defaultReason: R;
	formatReason: (reason: R) => string;
	isPending: boolean;
	products: ReversalProductOption[];
	reasons: readonly R[];
	services: ReversalServiceOption[];
	submitItems: (items: ReversalSubmitItem<R>[]) => Promise<unknown>;
	// Refund only: remaining refundable rupiah per lineKey. Presence turns on
	// the per-line amount preview, the running total, and the amount-bearing
	// submit label.
	capsByLineKey?: Map<string, number>;
}

const OrderLineReversalForm = <R extends string>({
	closeDialog,
	copy,
	defaultReason,
	formatReason,
	isPending,
	products,
	reasons,
	services,
	submitItems,
	capsByLineKey,
}: OrderLineReversalFormProps<R>) => {
	const lines = [
		...services.map((service) => ({
			kind: "service" as const,
			id: service.id,
			label: service.item_details ?? service.item_tag,
			sublabel: service.item_details
				? `${service.item_tag} · ${service.service_name}`
				: service.service_name,
			isRework: service.is_rework === true,
			workshopRework: service.workshopRework,
		})),
		...products.map((product) => ({
			kind: "product" as const,
			id: product.id,
			isRework: false,
			label: `${product.name} × ${product.qty}`,
			sublabel: undefined,
			workshopRework: undefined,
		})),
	];
	const hasBothKinds = services.length > 0 && products.length > 0;
	const reasonItems = reasons.map((reason) => ({
		value: reason as string,
		label: formatReason(reason),
	}));
	const schema = useMemo(
		() => buildReversalSchema(copy.verb, reasons),
		[copy.verb, reasons],
	);
	const form = useForm<ReversalFormValues>({
		resolver: zodResolver(schema),
		defaultValues: {
			items: lines.map((line) => ({
				id: line.id,
				kind: line.kind,
				selected: false,
				reason: defaultReason,
				note: "",
				keep_rework: false,
			})),
		},
	});
	const { fields } = useFieldArray({ control: form.control, name: "items" });
	// The dialog store renders a closure captured at open time, so the isPending
	// prop is a frozen snapshot of the mutation result. isSubmitting comes from
	// this form's own state and reliably disables re-submits while the mutation
	// promise is in flight.
	const pending = isPending || form.formState.isSubmitting;
	const watchedItems = useWatch({
		control: form.control,
		name: "items",
		// Refund only: the whole-array watch feeds previewAmounts/totalRefund,
		// both dead without caps. Disabling it spares the cancel dialog a full
		// re-render per keystroke.
		disabled: !capsByLineKey,
	});
	// Amounts come from the same allocateRefund the server runs at submit.
	// Selected lines are allocated together (leftover rupiah shift with the
	// set); unselected lines preview what they'd refund alone.
	const previewAmounts = useMemo(() => {
		const amounts = new Map<string, number>();
		if (!capsByLineKey) {
			return amounts;
		}
		const items = watchedItems ?? [];
		const selected = items.filter(
			(item) =>
				item.selected &&
				(capsByLineKey.get(lineKey(item.kind, item.id)) ?? 0) > 0,
		);
		if (selected.length > 0) {
			for (const line of allocateRefund({ capsByLineKey, lines: selected })) {
				amounts.set(lineKey(line.kind, line.id), line.amount);
			}
		}
		for (const item of items) {
			const key = lineKey(item.kind, item.id);
			if (!amounts.has(key)) {
				const cap = capsByLineKey.get(key) ?? 0;
				amounts.set(
					key,
					cap > 0
						? allocateRefund({
								capsByLineKey,
								lines: [{ id: item.id, kind: item.kind }],
							})[0].amount
						: 0,
				);
			}
		}
		return amounts;
	}, [watchedItems, capsByLineKey]);
	const totalRefund = (watchedItems ?? []).reduce(
		(sum, item) =>
			item.selected
				? sum + (previewAmounts.get(lineKey(item.kind, item.id)) ?? 0)
				: sum,
		0,
	);
	const itemsError = form.formState.errors.items;
	const itemsRootMessage =
		itemsError && !Array.isArray(itemsError)
			? (itemsError as { message?: string }).message
			: undefined;

	const handleSelectAll = () => {
		for (const index of fields.keys()) {
			form.setValue(`items.${index}.selected`, true, { shouldDirty: true });
		}
		form.clearErrors("items");
	};

	const handleClear = () => {
		for (const index of fields.keys()) {
			form.setValue(`items.${index}.selected`, false, { shouldDirty: true });
		}
	};

	const onSubmit = async (values: ReversalFormValues) => {
		const items = values.items
			.map((item, index) => ({ item, line: lines[index] }))
			.filter(({ item }) => item.selected)
			.map(({ item, line }) => ({
				...(item.kind === "service"
					? { order_service_id: item.id }
					: { order_product_id: item.id }),
				reason: item.reason as R,
				note: item.note?.trim() || undefined,
				...(line?.workshopRework ? { keep_rework: item.keep_rework } : {}),
			}));

		await submitItems(items);
		closeDialog();
	};

	const submitLabel = () => {
		if (pending) {
			return copy.pending;
		}
		if (capsByLineKey && totalRefund > 0) {
			return `Refund ${formatMoney(String(totalRefund))}`;
		}
		return copy.confirm;
	};

	return (
		<FormProvider {...form}>
			<form
				className="flex flex-col gap-4"
				onSubmit={form.handleSubmit(onSubmit)}
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="text-muted-foreground text-sm">
						Select lines to {copy.verb} and choose a reason for each.
					</p>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleSelectAll}
							disabled={pending || fields.length === 0}
						>
							Select all
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleClear}
							disabled={pending || fields.length === 0}
						>
							Clear
						</Button>
					</div>
				</div>

				{itemsRootMessage ? (
					<p className="text-destructive text-xs">{itemsRootMessage}</p>
				) : null}

				<div className="grid max-h-[50vh] gap-3 overflow-y-auto pr-1">
					{fields.map((field, index) => {
						const line = lines[index];
						const showKindHeader =
							hasBothKinds &&
							(index === 0 || lines[index - 1]?.kind !== line?.kind);

						return (
							<Fragment key={field.id}>
								{showKindHeader ? (
									<p className="text-muted-foreground text-xs font-medium">
										{line?.kind === "product" ? "Products" : "Services"}
									</p>
								) : null}
								<ReversalItemRow
									amount={
										capsByLineKey && line
											? (previewAmounts.get(lineKey(line.kind, line.id)) ?? 0)
											: undefined
									}
									disabled={pending}
									index={index}
									isRework={line?.isRework === true}
									label={line?.label ?? `Item #${index + 1}`}
									reasonItems={reasonItems}
									sublabel={line?.sublabel}
									workshopRework={line?.workshopRework}
								/>
							</Fragment>
						);
					})}
				</div>

				{capsByLineKey ? (
					<div className="flex items-center justify-between border-t pt-3 text-sm">
						<span className="text-muted-foreground">Refund total</span>
						<span className="font-medium tabular-nums">
							{formatMoney(String(totalRefund))}
						</span>
					</div>
				) : null}

				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button
						type="button"
						variant="outline"
						onClick={closeDialog}
						disabled={pending}
					>
						Go back
					</Button>
					<Button type="submit" variant="destructive" disabled={pending}>
						{submitLabel()}
					</Button>
				</div>
			</form>
		</FormProvider>
	);
};

interface ReversalItemRowProps {
	amount: number | undefined;
	disabled: boolean;
	index: number;
	isRework: boolean;
	label: string;
	reasonItems: { value: string; label: string }[];
	sublabel: string | undefined;
	workshopRework: WorkshopRework | undefined;
}

const ReversalItemRow = ({
	amount,
	disabled,
	index,
	isRework,
	label,
	reasonItems,
	sublabel,
	workshopRework,
}: ReversalItemRowProps) => {
	const { control, register } = useFormContext<ReversalFormValues>();
	const selected =
		useWatch({ control, name: `items.${index}.selected` }) ?? false;
	const inputsDisabled = disabled || !selected;
	// Only one reversal dialog mounts at a time (single GlobalDialog slot), so
	// a static prefix is safe and keeps ids decoupled from display copy.
	const checkboxId = `reversal-item-${index}`;

	return (
		<div className="grid gap-2 border p-3">
			<Controller
				control={control}
				name={`items.${index}.selected`}
				render={({ field }) => (
					<Field className="items-start" orientation="horizontal">
						<Checkbox
							id={checkboxId}
							checked={field.value}
							onCheckedChange={(value) => field.onChange(Boolean(value))}
							disabled={disabled}
						/>
						<FieldLabel
							className="grid gap-0.5 font-normal"
							htmlFor={checkboxId}
						>
							<span className="font-medium">{label}</span>
							{sublabel ? (
								<span className="text-muted-foreground text-xs">
									{sublabel}
								</span>
							) : null}
						</FieldLabel>
						{isRework ? <Badge variant="info">Rework</Badge> : null}
						{amount !== undefined ? (
							<span className="ml-auto text-sm tabular-nums">
								{formatMoney(String(amount))}
							</span>
						) : null}
					</Field>
				)}
			/>

			{workshopRework && selected ? (
				<ReworkChoice
					disabled={disabled}
					index={index}
					workshopRework={workshopRework}
				/>
			) : null}

			<Controller
				control={control}
				name={`items.${index}.reason`}
				render={({ field }) => (
					<SelectField
						items={reasonItems}
						value={field.value}
						onValueChange={field.onChange}
						disabled={inputsDisabled}
						placeholder="Select reason"
						className="w-full"
					/>
				)}
			/>

			<Controller
				control={control}
				name={`items.${index}.note`}
				render={({ fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<Textarea
							placeholder="Reason note"
							disabled={inputsDisabled}
							aria-invalid={fieldState.invalid}
							{...register(`items.${index}.note`)}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		</div>
	);
};

const REWORK_CHOICES = [
	{ keep: false, label: "Stop" },
	{ keep: true, label: "Keep" },
] as const;

interface ReworkChoiceProps {
	disabled: boolean;
	index: number;
	workshopRework: WorkshopRework;
}

const ReworkChoice = ({
	disabled,
	index,
	workshopRework,
}: ReworkChoiceProps) => {
	const { control } = useFormContext<ReversalFormValues>();

	return (
		<Controller
			control={control}
			name={`items.${index}.keep_rework`}
			render={({ field }) => (
				<div className="grid gap-1">
					<fieldset className="grid grid-cols-2 gap-2 border-0 p-0">
						<legend className="sr-only">
							Rework round {workshopRework.round}
						</legend>
						{REWORK_CHOICES.map((choice) => (
							<Button
								aria-pressed={field.value === choice.keep}
								disabled={disabled}
								key={choice.label}
								onClick={() => field.onChange(choice.keep)}
								size="sm"
								type="button"
								variant={field.value === choice.keep ? "default" : "outline"}
							>
								{choice.label}
							</Button>
						))}
					</fieldset>
					<p className="text-muted-foreground text-xs">
						{reworkChoiceCaption(workshopRework, field.value)}
					</p>
				</div>
			)}
		/>
	);
};

type CancelOrderMutation = UseMutationResult<
	unknown,
	Error,
	CancelOrderPayload,
	unknown
>;

interface CancelOrderFormProps {
	closeDialog: () => void;
	cancellableProducts: ReversalProductOption[];
	cancellableServices: ReversalServiceOption[];
	cancelOrderMutation: CancelOrderMutation;
}

export const CancelOrderForm = ({
	closeDialog,
	cancellableProducts,
	cancellableServices,
	cancelOrderMutation,
}: CancelOrderFormProps) => (
	<OrderLineReversalForm
		closeDialog={closeDialog}
		copy={{ verb: "cancel", confirm: "Confirm cancel", pending: "Cancelling…" }}
		defaultReason="customer_request"
		formatReason={formatCancelReason}
		isPending={cancelOrderMutation.isPending}
		products={cancellableProducts}
		reasons={CANCEL_REASONS}
		services={cancellableServices}
		submitItems={(items) => cancelOrderMutation.mutateAsync({ items })}
	/>
);

type RefundOrderMutation = UseMutationResult<
	unknown,
	Error,
	{ orderId: number; payload: CreateOrderRefundPayload },
	unknown
>;

interface RefundOrderFormProps {
	capsByLineKey: Map<string, number>;
	closeDialog: () => void;
	orderId: number;
	refundableProducts: ReversalProductOption[];
	refundableServices: ReversalServiceOption[];
	refundMutation: RefundOrderMutation;
}

export const RefundOrderForm = ({
	capsByLineKey,
	closeDialog,
	orderId,
	refundableProducts,
	refundableServices,
	refundMutation,
}: RefundOrderFormProps) => (
	<OrderLineReversalForm
		capsByLineKey={capsByLineKey}
		closeDialog={closeDialog}
		copy={{ verb: "refund", confirm: "Confirm refund", pending: "Refunding…" }}
		defaultReason="damaged"
		formatReason={formatRefundReason}
		isPending={refundMutation.isPending}
		products={refundableProducts}
		reasons={REFUND_REASONS}
		services={refundableServices}
		submitItems={(items) =>
			refundMutation.mutateAsync({ orderId, payload: { items } })
		}
	/>
);
