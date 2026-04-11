import { PlusIcon } from "@phosphor-icons/react";
import {
	Controller,
	type SubmitHandler,
	useFormContext,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
	FieldTitle,
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

export type UserFormState = {
	username: string;
	name: string;
	password: string;
	confirm_password: string;
	role: "admin" | "cashier" | "worker";
	is_active: boolean;
	store_ids: number[];
};

type UserFormProps = {
	onSubmit: SubmitHandler<UserFormState>;
	isEditing: boolean;
	stores: Array<{ id: number; code: string; name: string }>;
	onReset: () => void;
};

export function UserForm({
	onSubmit,
	isEditing,
	stores,
	onReset,
}: UserFormProps) {
	const { control, handleSubmit, formState } = useFormContext<UserFormState>();
	const isSubmitting = formState.isSubmitting;

	return (
		<form onSubmit={handleSubmit(onSubmit)}>
			<FieldGroup>
				<Controller
					name="username"
					control={control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="user-username" asterisk>
								Username
							</FieldLabel>
							<Input
								{...field}
								id="user-username"
								placeholder="e.g. cashier01"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting || isEditing}
								className="h-10"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="name"
					control={control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="user-name" asterisk>
								Name
							</FieldLabel>
							<Input
								{...field}
								id="user-name"
								placeholder="e.g. Budi Santoso"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
								className="h-10"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				{!isEditing ? (
					<>
						<Controller
							name="password"
							control={control}
							render={({ field, fieldState }) => (
								<Field data-invalid={fieldState.invalid}>
									<FieldLabel htmlFor="user-password" asterisk>
										Password
									</FieldLabel>
									<Input
										{...field}
										id="user-password"
										type="password"
										placeholder="Enter password"
										aria-invalid={fieldState.invalid}
										disabled={isSubmitting}
										className="h-10"
									/>
									<FieldError errors={[fieldState.error]} />
								</Field>
							)}
						/>

						<Controller
							name="confirm_password"
							control={control}
							render={({ field, fieldState }) => (
								<Field data-invalid={fieldState.invalid}>
									<FieldLabel htmlFor="user-confirm-password" asterisk>
										Confirm Password
									</FieldLabel>
									<Input
										{...field}
										id="user-confirm-password"
										type="password"
										placeholder="Confirm password"
										aria-invalid={fieldState.invalid}
										disabled={isSubmitting}
										className="h-10"
									/>
									<FieldError errors={[fieldState.error]} />
								</Field>
							)}
						/>
					</>
				) : null}

				<Controller
					name="role"
					control={control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="user-role">Role</FieldLabel>
							<Select
								value={field.value}
								onValueChange={(value) =>
									field.onChange((value ?? "cashier") as UserFormState["role"])
								}
								disabled={isSubmitting}
							>
								<SelectTrigger id="user-role" className="h-10 w-full text-sm">
									<SelectValue placeholder="Select role" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="admin">Admin</SelectItem>
									<SelectItem value="cashier">Cashier</SelectItem>
									<SelectItem value="worker">Worker</SelectItem>
								</SelectContent>
							</Select>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="is_active"
					control={control}
					render={({ field }) => (
						<FieldLabel htmlFor="user-active" className="md:col-span-2">
							<Field orientation="horizontal">
								<FieldContent>
									<FieldTitle>Active</FieldTitle>
									<FieldDescription>
										Active users can sign in and access their assigned areas.
									</FieldDescription>
								</FieldContent>
								<Switch
									id="user-active"
									checked={field.value}
									onCheckedChange={(checked) => field.onChange(!!checked)}
									disabled={isSubmitting}
								/>
							</Field>
						</FieldLabel>
					)}
				/>

				<Controller
					name="store_ids"
					control={control}
					render={({ field }) => (
						<FieldSet className="border p-2">
							<FieldLegend variant="label">Assigned Stores</FieldLegend>
							<FieldGroup>
								{stores.map((store) => (
									<Field key={store.id} orientation="horizontal">
										<Checkbox
											id={`user-store-${store.id}`}
											checked={field.value.includes(store.id)}
											onCheckedChange={(value) => {
												if (value) {
													field.onChange([...field.value, store.id]);
													return;
												}
												field.onChange(
													field.value.filter((v) => v !== store.id),
												);
											}}
											disabled={isSubmitting}
										/>
										<FieldLabel htmlFor={`user-store-${store.id}`}>
											{store.name}
										</FieldLabel>
									</Field>
								))}
							</FieldGroup>
						</FieldSet>
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
						{isEditing ? "Update User" : "Create User"}
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}
