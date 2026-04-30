import { zodResolver } from "@hookform/resolvers/zod";
import type { UseMutationResult } from "@tanstack/react-query";
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
import type { CreateOrderRefundPayload, OrderRefundReason } from "@/lib/api";
import { formatRefundReason, REFUND_REASONS } from "@/lib/status";

const refundFormSchema = z
	.object({
		items: z.array(
			z.object({
				order_service_id: z.number(),
				selected: z.boolean(),
				reason: z.enum(REFUND_REASONS),
				note: z.string().optional(),
			}),
		),
		note: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		const selectedCount = data.items.filter((item) => item.selected).length;
		if (selectedCount === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["items"],
				message: "Select at least one item to refund.",
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

type RefundFormValues = z.infer<typeof refundFormSchema>;

type RefundOrderMutation = UseMutationResult<
	unknown,
	Error,
	{ orderId: number; payload: CreateOrderRefundPayload },
	unknown
>;

export interface RefundableServiceOption {
	id: number;
	item_code: string | null;
}

interface RefundOrderFormProps {
	closeDialog: () => void;
	orderId: number;
	refundableServices: RefundableServiceOption[];
	refundMutation: RefundOrderMutation;
}

export const RefundOrderForm = ({
	closeDialog,
	orderId,
	refundableServices,
	refundMutation,
}: RefundOrderFormProps) => {
	const form = useForm<RefundFormValues>({
		resolver: zodResolver(refundFormSchema),
		defaultValues: {
			items: refundableServices.map((service) => ({
				order_service_id: service.id,
				selected: false,
				reason: "damaged",
				note: "",
			})),
			note: "",
		},
	});
	const { fields } = useFieldArray({ control: form.control, name: "items" });
	const isPending = refundMutation.isPending;
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

	const onSubmit = async (values: RefundFormValues) => {
		const items = values.items
			.filter((item) => item.selected)
			.map((item) => ({
				order_service_id: item.order_service_id,
				reason: item.reason,
				note: item.note?.trim() || undefined,
			}));

		await refundMutation.mutateAsync({
			orderId,
			payload: {
				items,
				note: values.note?.trim() || undefined,
			},
		});
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
						Select items to refund and choose a reason for each.
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
					{fields.map((field, index) => (
						<RefundItemRow
							key={field.id}
							index={index}
							label={
								refundableServices[index]?.item_code ??
								`Service #${refundableServices[index]?.id ?? index + 1}`
							}
							disabled={isPending}
						/>
					))}
				</div>

				<Field>
					<FieldLabel htmlFor="refund-note">Refund note (optional)</FieldLabel>
					<Textarea
						id="refund-note"
						placeholder="General refund note"
						disabled={isPending}
						{...form.register("note")}
					/>
				</Field>

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
						{isPending ? "Refunding…" : "Confirm refund"}
					</Button>
				</div>
			</form>
		</FormProvider>
	);
};

interface RefundItemRowProps {
	disabled: boolean;
	index: number;
	label: string;
}

const RefundItemRow = ({ disabled, index, label }: RefundItemRowProps) => {
	const { control, register } = useFormContext<RefundFormValues>();
	const selected =
		useWatch({ control, name: `items.${index}.selected` }) ?? false;
	const inputsDisabled = disabled || !selected;
	const checkboxId = `refund-item-${index}`;

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
							field.onChange((value ?? "damaged") as OrderRefundReason)
						}
						disabled={inputsDisabled}
					>
						<SelectTrigger size="md" className="w-full">
							<SelectValue placeholder="Select reason">
								{field.value ? formatRefundReason(field.value) : undefined}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{REFUND_REASONS.map((reason) => (
								<SelectItem key={reason} value={reason}>
									{formatRefundReason(reason)}
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
