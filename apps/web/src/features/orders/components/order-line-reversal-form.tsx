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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { CancelOrderPayload, CreateOrderRefundPayload } from "@/lib/api";
import {
	CANCEL_REASONS,
	formatCancelReason,
	formatRefundReason,
	REFUND_REASONS,
} from "@/lib/status";
import { formatIDRCurrency } from "@/shared/utils";

// Cancel is the unpaid, per-line twin of refund (ADR-0008): one deep form —
// line picker, per-line reason/note, validation, submit — with a shallow
// config per off-ramp. The refund config additionally carries line caps to
// preview the exact amounts the server will book.

export interface ReversalServiceOption {
	id: number;
	item_code: string | null;
}

export interface ReversalProductOption {
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
};

const buildReversalSchema = (verb: string) =>
	z
		.object({
			items: z.array(
				z.object({
					id: z.number(),
					kind: z.enum(["service", "product"]),
					selected: z.boolean(),
					// Values come from the config's reasons list via the Select; the
					// server re-validates against its own enum.
					reason: z.string(),
					note: z.string().optional(),
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
			data.items.forEach((item, index) => {
				if (
					item.selected &&
					item.reason === "other" &&
					!(item.note ?? "").trim()
				) {
					ctx.addIssue({
						code: "custom",
						path: ["items", index, "note"],
						message: "Note is required when reason is Other.",
					});
				}
			});
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
			label: service.item_code ?? `Service #${service.id}`,
		})),
		...products.map((product) => ({
			kind: "product" as const,
			id: product.id,
			label: `${product.name} × ${product.qty}`,
		})),
	];
	const hasBothKinds = services.length > 0 && products.length > 0;
	const schema = useMemo(() => buildReversalSchema(copy.verb), [copy.verb]);
	const form = useForm<ReversalFormValues>({
		resolver: zodResolver(schema),
		defaultValues: {
			items: lines.map((line) => ({
				id: line.id,
				kind: line.kind,
				selected: false,
				reason: defaultReason,
				note: "",
			})),
		},
	});
	const { fields } = useFieldArray({ control: form.control, name: "items" });
	const watchedItems = useWatch({ control: form.control, name: "items" });
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
		fields.forEach((_, index) => {
			form.setValue(`items.${index}.selected`, true, { shouldDirty: true });
		});
		form.clearErrors("items");
	};

	const handleClear = () => {
		fields.forEach((_, index) => {
			form.setValue(`items.${index}.selected`, false, { shouldDirty: true });
		});
	};

	const onSubmit = async (values: ReversalFormValues) => {
		const items = values.items
			.filter((item) => item.selected)
			.map((item) => ({
				...(item.kind === "service"
					? { order_service_id: item.id }
					: { order_product_id: item.id }),
				reason: item.reason as R,
				note: item.note?.trim() || undefined,
			}));

		await submitItems(items);
		closeDialog();
	};

	const submitLabel = () => {
		if (isPending) {
			return copy.pending;
		}
		if (capsByLineKey && totalRefund > 0) {
			return `Refund ${formatIDRCurrency(String(totalRefund))}`;
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
						Select items to {copy.verb} and choose a reason for each.
					</p>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleSelectAll}
							disabled={isPending || fields.length === 0}
						>
							Select all
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleClear}
							disabled={isPending || fields.length === 0}
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
									<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
										{line?.kind === "product" ? "Products" : "Services"}
									</p>
								) : null}
								<ReversalItemRow
									amount={
										capsByLineKey && line
											? (previewAmounts.get(lineKey(line.kind, line.id)) ?? 0)
											: undefined
									}
									disabled={isPending}
									formatReason={formatReason}
									idPrefix={copy.verb}
									index={index}
									label={line?.label ?? `Item #${index + 1}`}
									reasons={reasons}
								/>
							</Fragment>
						);
					})}
				</div>

				{capsByLineKey ? (
					<div className="flex items-center justify-between border-t pt-3 text-sm">
						<span className="text-muted-foreground">Refund total</span>
						<span className="font-medium font-mono tabular-nums">
							{formatIDRCurrency(String(totalRefund)) || "Rp0"}
						</span>
					</div>
				) : null}

				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button
						type="button"
						variant="outline"
						onClick={closeDialog}
						disabled={isPending}
					>
						Go back
					</Button>
					<Button type="submit" variant="destructive" disabled={isPending}>
						{submitLabel()}
					</Button>
				</div>
			</form>
		</FormProvider>
	);
};

interface ReversalItemRowProps<R extends string> {
	amount: number | undefined;
	disabled: boolean;
	formatReason: (reason: R) => string;
	idPrefix: string;
	index: number;
	label: string;
	reasons: readonly R[];
}

const ReversalItemRow = <R extends string>({
	amount,
	disabled,
	formatReason,
	idPrefix,
	index,
	label,
	reasons,
}: ReversalItemRowProps<R>) => {
	const { control, register } = useFormContext<ReversalFormValues>();
	const selected =
		useWatch({ control, name: `items.${index}.selected` }) ?? false;
	const inputsDisabled = disabled || !selected;
	const checkboxId = `${idPrefix}-item-${index}`;

	return (
		<div className="grid gap-2 border p-3">
			<Controller
				control={control}
				name={`items.${index}.selected`}
				render={({ field }) => (
					<Field orientation="horizontal">
						<Checkbox
							id={checkboxId}
							checked={field.value}
							onCheckedChange={(value) => field.onChange(Boolean(value))}
							disabled={disabled}
						/>
						<FieldLabel htmlFor={checkboxId}>{label}</FieldLabel>
						{amount !== undefined ? (
							<span className="ml-auto font-mono text-sm tabular-nums">
								{formatIDRCurrency(String(amount)) || "Rp0"}
							</span>
						) : null}
					</Field>
				)}
			/>

			<Controller
				control={control}
				name={`items.${index}.reason`}
				render={({ field }) => (
					<SelectField
						items={reasons.map((reason) => ({
							value: reason,
							label: formatReason(reason),
						}))}
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
