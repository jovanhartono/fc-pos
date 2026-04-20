import { POSTStoreSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { PhoneNumberField } from "@/components/form/phone-number-field";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
			<FieldGroup>
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
							<FieldLabel htmlFor="store-name" asterisk>
								Name
							</FieldLabel>
							<Input
								{...field}
								id="store-name"
								placeholder="e.g. Fresclean Sudirman"
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
					control={form.control}
					render={({ field, fieldState }) => (
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
					)}
				/>
				<Controller
					name="address"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid} className="md:col-span-2">
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
								className="h-10"
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
								className="h-10"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>
				<Controller
					name="is_active"
					control={form.control}
					render={({ field }) => (
						<FieldLabel htmlFor="store-active">
							<Field orientation="horizontal">
								<FieldContent>
									<FieldTitle>Active</FieldTitle>
									<FieldDescription>
										Active store will be shown in the app.
									</FieldDescription>
								</FieldContent>
								<Switch
									id="store-active"
									checked={field.value}
									onCheckedChange={(checked) => field.onChange(!!checked)}
									disabled={isSubmitting}
								/>
							</Field>
						</FieldLabel>
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
						icon={<PlusIcon className="size-4" />}
					>
						{isEditing ? "Update Store" : "Create Store"}
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}
