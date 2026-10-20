import { POSTStoreSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { PhoneNumberField } from "@/components/form/phone-number-field";
import {
	SHEET_FORM_GRID,
	SheetFormActions,
} from "@/components/form/sheet-form-actions";
import { SwitchList, SwitchRow } from "@/components/form/switch-list";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSheetDirtyGuard } from "@/hooks/useSheetDirtyGuard";

export type StoreFormState = z.infer<typeof POSTStoreSchema>;

const defaultForm: StoreFormState = {
	code: "",
	name: "",
	phone_number: "",
	address: "",
	latitude: "",
	longitude: "",
	is_active: true,
};

type StoreFormProps = {
	defaultValues?: StoreFormState;
	handleOnSubmit: (values: StoreFormState) => Promise<void> | void;
	isSubmitting?: boolean;
	isEditing: boolean;
	onReset: () => void;
};

export function StoreForm({
	defaultValues,
	handleOnSubmit,
	isSubmitting: isSubmittingProp = false,
	isEditing,
	onReset,
}: StoreFormProps) {
	const form = useForm({
		resolver: zodResolver(POSTStoreSchema),
		defaultValues: defaultValues ?? defaultForm,
	});
	const isSubmitting = form.formState.isSubmitting || isSubmittingProp;
	useSheetDirtyGuard(form.formState.isDirty);

	return (
		<form onSubmit={form.handleSubmit(handleOnSubmit)}>
			<FieldGroup className={SHEET_FORM_GRID}>
				<Controller
					name="code"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="store-code" asterisk>
								Code
							</FieldLabel>
							<Input
								{...field}
								id="store-code"
								placeholder="e.g. STR-JKT-01"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
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
							<FieldLabel htmlFor="store-name" asterisk>
								Name
							</FieldLabel>
							<Input
								{...field}
								id="store-name"
								placeholder="e.g. Fresclean Sudirman"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>
				<Controller
					name="phone_number"
					control={form.control}
					render={({ field, fieldState }) => (
						<div className="col-span-full">
							<PhoneNumberField
								id="store-phone"
								label="Phone"
								value={field.value}
								placeholder="e.g. +628123456789"
								onValueChange={field.onChange}
								disabled={isSubmitting}
								required
								error={fieldState.error}
							/>
						</div>
					)}
				/>
				<Controller
					name="address"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid} className="col-span-full">
							<FieldLabel htmlFor="store-address" asterisk>
								Address
							</FieldLabel>
							<Textarea
								{...field}
								id="store-address"
								placeholder="e.g. Jl. Sudirman No. 10"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>
				<Controller
					name="latitude"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="store-latitude" asterisk>
								Latitude
							</FieldLabel>
							<Input
								name={field.name}
								ref={field.ref}
								onBlur={field.onBlur}
								onChange={(event) => field.onChange(event.target.value)}
								id="store-latitude"
								placeholder="e.g. -6.200000"
								aria-invalid={fieldState.invalid}
								value={String(field.value ?? "")}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>
				<Controller
					name="longitude"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="store-longitude" asterisk>
								Longitude
							</FieldLabel>
							<Input
								name={field.name}
								ref={field.ref}
								onBlur={field.onBlur}
								onChange={(event) => field.onChange(event.target.value)}
								id="store-longitude"
								placeholder="e.g. 106.816666"
								aria-invalid={fieldState.invalid}
								value={String(field.value ?? "")}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>
				<SwitchList>
					<Controller
						name="is_active"
						control={form.control}
						render={({ field }) => (
							<SwitchRow
								checked={field.value}
								disabled={isSubmitting}
								id="store-active"
								onCheckedChange={field.onChange}
								title="Active"
							/>
						)}
					/>
				</SwitchList>
				<SheetFormActions
					addLabel="Add store"
					isEditing={isEditing}
					isSubmitting={isSubmitting}
					onCancel={onReset}
				/>
			</FieldGroup>
		</form>
	);
}
