import { PlusIcon } from "@phosphor-icons/react";
import {
	type Control,
	Controller,
	type SubmitHandler,
	type UseFormHandleSubmit,
} from "react-hook-form";
import { PhoneNumberField } from "@/components/form/phone-number-field";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";

export type CustomerFormState = {
	name: string;
	phone_number: string;
	email: string;
	address: string;
	origin_store_id?: number;
};

type CustomerFormProps = {
	control: Control<CustomerFormState>;
	handleSubmit: UseFormHandleSubmit<CustomerFormState>;
	onSubmit: SubmitHandler<CustomerFormState>;
	isSubmitting: boolean;
	isEditing: boolean;
	onReset: () => void;
};

export function CustomerForm({
	control,
	handleSubmit,
	onSubmit,
	isSubmitting,
	isEditing,
	onReset,
}: CustomerFormProps) {
	return (
		<form onSubmit={handleSubmit(onSubmit)}>
			<FieldGroup>
				<Controller
					name="name"
					control={control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="customer-name" asterisk>
								Name
							</FieldLabel>
							<Input
								{...field}
								id="customer-name"
								placeholder="e.g. John Doe"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
								className="h-10"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="phone_number"
					control={control}
					render={({ field, fieldState }) => (
						<PhoneNumberField
							id="customer-phone"
							label="Phone"
							value={field.value}
							onValueChange={field.onChange}
							placeholder="e.g. +628123456789"
							disabled={isSubmitting}
							required
							error={fieldState.error}
						/>
					)}
				/>

				<Controller
					name="email"
					control={control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="customer-email">Email</FieldLabel>
							<Input
								{...field}
								id="customer-email"
								type="email"
								placeholder="e.g. john@example.com"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
								className="h-10"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="address"
					control={control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid} className="md:col-span-2">
							<FieldLabel htmlFor="customer-address">Address</FieldLabel>
							<Textarea
								{...field}
								id="customer-address"
								placeholder="e.g. Jl. Sudirman No. 1"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="origin_store_id"
					control={control}
					render={({ field, fieldState }) => (
						<StoreAutocomplete
							id="customer-origin-store"
							label="Origin Store"
							value={field.value ? String(field.value) : ""}
							onValueChange={(value) =>
								field.onChange(value ? Number(value) : undefined)
							}
							disabled={isSubmitting || isEditing}
							error={fieldState.error}
						/>
					)}
				/>

				<div className="flex flex-wrap items-center gap-2 md:col-span-2 md:justify-end">
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
						loadingText={
							isEditing ? "Updating customer..." : "Creating customer..."
						}
					>
						<PlusIcon className="size-4" weight="duotone" />
						{isEditing ? "Update Customer" : "Create Customer"}
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}
