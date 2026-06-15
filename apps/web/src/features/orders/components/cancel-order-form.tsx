import { zodResolver } from "@hookform/resolvers/zod";
import type { UseMutationResult } from "@tanstack/react-query";
import { Fragment } from "react";
import {
	Controller,
	FormProvider,
	useFieldArray,
	useForm,
	useFormContext,
	useWatch,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CancelOrderPayload, OrderCancelReason } from "@/lib/api";
import { CANCEL_REASONS, formatCancelReason } from "@/lib/status";

const cancelFormSchema = z
	.object({
		items: z.array(
			z.object({
				id: z.number(),
				kind: z.enum(["service", "product"]),
				selected: z.boolean(),
				reason: z.enum(CANCEL_REASONS),
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
				message: "Select at least one item to cancel.",
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

type CancelFormValues = z.infer<typeof cancelFormSchema>;

type CancelOrderMutation = UseMutationResult<
	unknown,
	Error,
	CancelOrderPayload,
	unknown
>;

export interface CancellableServiceOption {
	id: number;
	item_code: string | null;
}

export interface CancellableProductOption {
	id: number;
	name: string;
	qty: number;
}

interface CancelOrderFormProps {
	closeDialog: () => void;
	cancellableProducts: CancellableProductOption[];
	cancellableServices: CancellableServiceOption[];
	cancelOrderMutation: CancelOrderMutation;
}

export const CancelOrderForm = ({
	closeDialog,
	cancellableProducts,
	cancellableServices,
	cancelOrderMutation,
}: CancelOrderFormProps) => {
	const cancelLines = [
		...cancellableServices.map((service) => ({
			kind: "service" as const,
			id: service.id,
			label: service.item_code ?? `Service #${service.id}`,
		})),
		...cancellableProducts.map((product) => ({
			kind: "product" as const,
			id: product.id,
			label: `${product.name} × ${product.qty}`,
		})),
	];
	const hasBothKinds =
		cancellableServices.length > 0 && cancellableProducts.length > 0;
	const form = useForm<CancelFormValues>({
		resolver: zodResolver(cancelFormSchema),
		defaultValues: {
			items: cancelLines.map((line) => ({
				id: line.id,
				kind: line.kind,
				selected: false,
				reason: "customer_request",
				note: "",
			})),
		},
	});
	const { fields } = useFieldArray({ control: form.control, name: "items" });
	const isPending = cancelOrderMutation.isPending;
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

	const onSubmit = async (values: CancelFormValues) => {
		const items = values.items
			.filter((item) => item.selected)
			.map((item) => ({
				...(item.kind === "service"
					? { order_service_id: item.id }
					: { order_product_id: item.id }),
				reason: item.reason,
				note: item.note?.trim() || undefined,
			}));

		await cancelOrderMutation.mutateAsync({ items });
		closeDialog();
	};

	return (
		<FormProvider {...form}>
			<form
				className="flex flex-col gap-4"
				onSubmit={form.handleSubmit(onSubmit)}
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="text-muted-foreground text-sm">
						Select items to cancel and choose a reason for each.
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
						const line = cancelLines[index];
						const showKindHeader =
							hasBothKinds &&
							(index === 0 || cancelLines[index - 1]?.kind !== line?.kind);

						return (
							<Fragment key={field.id}>
								{showKindHeader ? (
									<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
										{line?.kind === "product" ? "Products" : "Services"}
									</p>
								) : null}
								<CancelItemRow
									index={index}
									label={line?.label ?? `Item #${index + 1}`}
									disabled={isPending}
								/>
							</Fragment>
						);
					})}
				</div>

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
						{isPending ? "Cancelling…" : "Confirm cancel"}
					</Button>
				</div>
			</form>
		</FormProvider>
	);
};

interface CancelItemRowProps {
	disabled: boolean;
	index: number;
	label: string;
}

const CancelItemRow = ({ disabled, index, label }: CancelItemRowProps) => {
	const { control, register } = useFormContext<CancelFormValues>();
	const selected =
		useWatch({ control, name: `items.${index}.selected` }) ?? false;
	const inputsDisabled = disabled || !selected;
	const checkboxId = `cancel-item-${index}`;

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
					</Field>
				)}
			/>

			<Controller
				control={control}
				name={`items.${index}.reason`}
				render={({ field }) => (
					<Select
						value={field.value}
						onValueChange={(value) =>
							field.onChange((value ?? "customer_request") as OrderCancelReason)
						}
						disabled={inputsDisabled}
					>
						<SelectTrigger size="md" className="w-full">
							<SelectValue placeholder="Select reason">
								{field.value ? formatCancelReason(field.value) : undefined}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{CANCEL_REASONS.map((reason) => (
								<SelectItem key={reason} value={reason}>
									{formatCancelReason(reason)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
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
