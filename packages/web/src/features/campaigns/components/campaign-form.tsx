import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CampaignPayload } from "@/lib/api";

const campaignFormSchema = z.object({
	code: z.string().trim().min(1, "Code is required"),
	name: z.string().trim().min(1, "Name is required"),
	discount_type: z.enum(["fixed", "percentage"]),
	discount_value: z.string().trim().min(1, "Discount value is required"),
	min_order_total: z.string().trim().min(1, "Min order total is required"),
	max_discount: z.string().trim().optional(),
	starts_at: z.string().trim().optional(),
	ends_at: z.string().trim().optional(),
	is_active: z.boolean(),
	store_ids: z.array(z.number().int().positive()),
});

export type CampaignFormState = z.infer<typeof campaignFormSchema>;

type CampaignFormProps = {
	defaultValues: CampaignFormState;
	stores: Array<{ id: number; name: string; code: string }>;
	handleOnSubmit: (values: CampaignPayload) => Promise<void> | void;
	isEditing: boolean;
	onReset: () => void;
};

function toCampaignPayload(values: CampaignFormState): CampaignPayload {
	return {
		code: values.code,
		name: values.name,
		discount_type: values.discount_type,
		discount_value: values.discount_value,
		min_order_total: values.min_order_total,
		max_discount: values.max_discount?.trim() ? values.max_discount : null,
		starts_at: values.starts_at ? new Date(values.starts_at) : null,
		ends_at: values.ends_at ? new Date(values.ends_at) : null,
		is_active: values.is_active,
		store_ids: values.store_ids,
	};
}

export function CampaignForm({
	defaultValues,
	stores,
	handleOnSubmit,
	isEditing,
	onReset,
}: CampaignFormProps) {
	const form = useForm<CampaignFormState>({
		resolver: zodResolver(campaignFormSchema),
		defaultValues,
	});
	const isSubmitting = form.formState.isSubmitting;
	const discountType = form.watch("discount_type");

	return (
		<form
			onSubmit={form.handleSubmit(async (values) => {
				await handleOnSubmit(toCampaignPayload(values));
			})}
		>
			<FieldGroup>
				<Controller
					name="code"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="campaign-code" asterisk>
								Code
							</FieldLabel>
							<Input
								{...field}
								id="campaign-code"
								placeholder="e.g. MARCH10"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
								className="h-10"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="name"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="campaign-name" asterisk>
								Name
							</FieldLabel>
							<Input
								{...field}
								id="campaign-name"
								placeholder="e.g. March Promo"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
								className="h-10"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="discount_type"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="campaign-discount-type" asterisk>
								Discount Type
							</FieldLabel>
							<Select
								value={field.value}
								onValueChange={(value) =>
									field.onChange((value ?? "fixed") as "fixed" | "percentage")
								}
								disabled={isSubmitting}
							>
								<SelectTrigger id="campaign-discount-type" className="h-10">
									<SelectValue placeholder="Select discount type" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="fixed">Fixed</SelectItem>
									<SelectItem value="percentage">Percentage</SelectItem>
								</SelectContent>
							</Select>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="discount_value"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="campaign-discount-value" asterisk>
								Discount Value
							</FieldLabel>
							{discountType === "fixed" ? (
								<CurrencyInput
									id="campaign-discount-value"
									placeholder="Rp0"
									value={field.value}
									onValueChange={field.onChange}
									disabled={isSubmitting}
									required
								/>
							) : (
								<Input
									{...field}
									id="campaign-discount-value"
									type="number"
									placeholder="e.g. 10"
									min={1}
									aria-invalid={fieldState.invalid}
									disabled={isSubmitting}
									className="h-10"
								/>
							)}
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="min_order_total"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="campaign-min-order" asterisk>
								Min Order Total
							</FieldLabel>
							<CurrencyInput
								id="campaign-min-order"
								placeholder="Rp0"
								value={field.value}
								onValueChange={field.onChange}
								disabled={isSubmitting}
								required
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="max_discount"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="campaign-max-discount">
								Max Discount
							</FieldLabel>
							<CurrencyInput
								id="campaign-max-discount"
								placeholder="optional"
								value={field.value ?? ""}
								onValueChange={field.onChange}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="starts_at"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="campaign-starts-at">Starts At</FieldLabel>
							<Input
								{...field}
								id="campaign-starts-at"
								type="datetime-local"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
								className="h-10"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="ends_at"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="campaign-ends-at">Ends At</FieldLabel>
							<Input
								{...field}
								id="campaign-ends-at"
								type="datetime-local"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
								className="h-10"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="store_ids"
					control={form.control}
					render={({ field }) => (
						<Field className="md:col-span-2">
							<FieldLabel>Stores (empty = all stores)</FieldLabel>
							<div className="grid gap-2 rounded-none border p-3 md:grid-cols-2">
								{stores.map((store) => {
									const checked = field.value.includes(store.id);
									return (
										<label
											key={store.id}
											className="flex items-center gap-2 text-sm"
										>
											<input
												type="checkbox"
												checked={checked}
												onChange={(event) => {
													if (event.target.checked) {
														field.onChange([...field.value, store.id]);
														return;
													}

													field.onChange(
														field.value.filter((id: number) => id !== store.id),
													);
												}}
												disabled={isSubmitting}
											/>
											<span>{`${store.code} - ${store.name}`}</span>
										</label>
									);
								})}
							</div>
						</Field>
					)}
				/>

				<Controller
					name="is_active"
					control={form.control}
					render={({ field }) => (
						<Field className="flex-row items-center justify-between md:col-span-2">
							<FieldLabel htmlFor="campaign-active">Active</FieldLabel>
							<Switch
								id="campaign-active"
								checked={field.value}
								onCheckedChange={(checked) => field.onChange(!!checked)}
								disabled={isSubmitting}
							/>
						</Field>
					)}
				/>

				<div className="flex flex-wrap gap-2 md:col-span-2 md:justify-end">
					{isEditing ? (
						<Button
							type="button"
							variant="outline"
							onClick={onReset}
							disabled={isSubmitting}
						>
							Cancel edit
						</Button>
					) : null}
					<Button
						type="submit"
						loading={isSubmitting}
						icon={<PlusIcon className="size-4" weight="duotone" />}
					>
						{isEditing ? "Update Campaign" : "Create Campaign"}
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}
