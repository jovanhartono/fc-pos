import {
	Controller,
	type SubmitHandler,
	useFormContext,
} from "react-hook-form";
import { SelectField } from "@/components/form/select-field";
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
import { StoreChecklist } from "@/features/stores/components/store-checklist";
import { useSheetDirtyGuard } from "@/hooks/useSheetDirtyGuard";

export type UserFormState = {
	username: string;
	name: string;
	password: string;
	confirm_password: string;
	role: "admin" | "cashier" | "worker" | "courier";
	is_active: boolean;
	can_process_pickup: boolean;
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
	useSheetDirtyGuard(formState.isDirty);

	return (
		<form onSubmit={handleSubmit(onSubmit)}>
			<FieldGroup className={SHEET_FORM_GRID}>
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
										Confirm password
									</FieldLabel>
									<Input
										{...field}
										id="user-confirm-password"
										type="password"
										placeholder="Confirm password"
										aria-invalid={fieldState.invalid}
										disabled={isSubmitting}
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
						<Field className="col-span-full" data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="user-role">Role</FieldLabel>
							<SelectField
								id="user-role"
								items={{
									admin: "Admin",
									cashier: "Cashier",
									worker: "Worker",
									courier: "Courier",
								}}
								value={field.value}
								onValueChange={(value) =>
									field.onChange(value as UserFormState["role"])
								}
								disabled={isSubmitting}
								className="w-full text-body"
								placeholder="Select role"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="store_ids"
					control={control}
					render={({ field }) => (
						<StoreChecklist
							disabled={isSubmitting}
							idPrefix="user-store"
							onChange={field.onChange}
							stores={stores}
							value={field.value}
						/>
					)}
				/>

				<SwitchList>
					<Controller
						name="is_active"
						control={control}
						render={({ field }) => (
							<SwitchRow
								checked={field.value}
								disabled={isSubmitting}
								id="user-active"
								onCheckedChange={field.onChange}
								title="Active"
							/>
						)}
					/>
					<Controller
						name="can_process_pickup"
						control={control}
						render={({ field }) => (
							<SwitchRow
								checked={field.value}
								disabled={isSubmitting}
								id="user-pickup"
								onCheckedChange={field.onChange}
								title="Can process pickup"
							/>
						)}
					/>
				</SwitchList>

				<SheetFormActions
					addLabel="Add user"
					isEditing={isEditing}
					isSubmitting={isSubmitting}
					onCancel={onReset}
				/>
			</FieldGroup>
		</form>
	);
}
