import { POSTCategorySchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
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

export type CategoryFormState = z.infer<typeof POSTCategorySchema>;

const defaultForm: CategoryFormState = {
	name: "",
	description: "",
	is_active: true,
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

	return (
		<form onSubmit={form.handleSubmit(handleOnSubmit)}>
			<FieldGroup>
				<Controller
					name="name"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="category-name">Name</FieldLabel>
							<Input
								{...field}
								id="category-name"
								placeholder="e.g. Laundry"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
								className="h-10"
							/>
							{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
						</Field>
					)}
				/>

				<Controller
					name="description"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid} className="md:col-span-2">
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
						<FieldLabel htmlFor="category-active">
							<Field orientation="horizontal">
								<FieldContent>
									<FieldTitle>Category Status</FieldTitle>
									<FieldDescription>
										Active category will be shown in the app.
									</FieldDescription>
								</FieldContent>
								<Switch
									id="category-active"
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
						icon={<PlusIcon className="size-4" weight="duotone" />}
					>
						{isEditing ? "Update Category" : "Create Category"}
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}
