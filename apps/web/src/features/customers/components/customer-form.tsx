import {
	Controller,
	type SubmitHandler,
	useFormContext,
} from "react-hook-form";
import { PhoneNumberField } from "@/components/form/phone-number-field";
import { SheetFormActions } from "@/components/form/sheet-form-actions";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StoreSelect } from "@/features/orders/components/store-select";

export type CustomerFormState = {
	name: string;
	phone_number: string;
	email: string;
	address: string;
	origin_store_id?: number;
};

interface CustomerFormProps {
	onSubmit: SubmitHandler<CustomerFormState>;
	isSubmitting: boolean;
	isEditing: boolean;
	onReset: () => void;
}

export const CustomerForm = ({
	onSubmit,
	isSubmitting,
	isEditing,
	onReset,
}: CustomerFormProps) => {
	const { control, handleSubmit } = useFormContext<CustomerFormState>();

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
						<StoreSelect
							id="customer-origin-store"
							label="Origin store"
							value={field.value ? String(field.value) : ""}
							onValueChange={(value) =>
								field.onChange(value ? Number(value) : undefined)
							}
							disabled={isSubmitting || isEditing}
							error={fieldState.error}
						/>
					)}
				/>

				<SheetFormActions
					addLabel="Add Customer"
					isEditing={isEditing}
					isSubmitting={isSubmitting}
					onCancel={onReset}
				/>
			</FieldGroup>
		</form>
	);
};
