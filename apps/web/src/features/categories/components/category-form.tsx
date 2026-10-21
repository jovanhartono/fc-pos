import { POSTCategorySchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { SheetFormActions } from "@/components/form/sheet-form-actions";
import { SwitchList, SwitchRow } from "@/components/form/switch-list";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSheetDirtyGuard } from "@/hooks/useSheetDirtyGuard";

export type CategoryFormState = z.infer<typeof POSTCategorySchema>;

const defaultForm: CategoryFormState = {
	name: "",
	description: "",
	is_active: true,
	starts_after_cleaning: false,
};

type CategoryFormProps = {
	defaultValues?: CategoryFormState;
	handleOnSubmit: (values: CategoryFormState) => Promise<void> | void;
	isEditing: boolean;
	onReset: () => void;
};

export function CategoryForm({
	defaultValues,
	handleOnSubmit,
	isEditing,
	onReset,
}: CategoryFormProps) {
	const form = useForm({
		resolver: zodResolver(POSTCategorySchema),
		defaultValues: defaultValues ?? defaultForm,
	});
	const isSubmitting = form.formState.isSubmitting;
	useSheetDirtyGuard(form.formState.isDirty);

	return (
		<form onSubmit={form.handleSubmit(handleOnSubmit)}>
			<FieldGroup>
				<Controller
					name="name"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="category-name" asterisk>
								Name
							</FieldLabel>
							<Input
								{...field}
								id="category-name"
								placeholder="e.g. Laundry"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
							/>
							{fieldState.invalid ? (
								<FieldError errors={[fieldState.error]} />
							) : null}
						</Field>
					)}
				/>

				<Controller
					name="description"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="category-description">
								Description
							</FieldLabel>
							<Input
								{...field}
								id="category-description"
								placeholder="e.g. Core laundry services"
								aria-invalid={fieldState.invalid}
								value={field.value ?? ""}
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
								id="category-active"
								onCheckedChange={field.onChange}
								title="Active"
							/>
						)}
					/>
					<Controller
						name="starts_after_cleaning"
						control={form.control}
						render={({ field }) => (
							<SwitchRow
								checked={!!field.value}
								description="Work waits until the Item is cleaned, like Repaint. The Counter adds its days on top of the clean."
								disabled={isSubmitting}
								id="category-starts-after-cleaning"
								onCheckedChange={field.onChange}
								title="Starts after cleaning"
							/>
						)}
					/>
				</SwitchList>

				<SheetFormActions
					addLabel="Add category"
					isEditing={isEditing}
					isSubmitting={isSubmitting}
					onCancel={onReset}
				/>
			</FieldGroup>
		</form>
	);
}
