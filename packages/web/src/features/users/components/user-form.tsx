import { Plus } from "@phosphor-icons/react";
import {
	type Control,
	Controller,
	type SubmitHandler,
	type UseFormHandleSubmit,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldLabel,
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
	control: Control<UserFormState>;
	handleSubmit: UseFormHandleSubmit<UserFormState>;
	onSubmit: SubmitHandler<UserFormState>;
	isSubmitting: boolean;
	isEditing: boolean;
	stores: Array<{ id: number; code: string; name: string }>;
	onReset: () => void;
};

export function UserForm({
	control,
	handleSubmit,
	onSubmit,
	isSubmitting,
	isEditing,
	stores,
	onReset,
}: UserFormProps) {
	return (
		<form
			className="grid gap-4 p-4 md:grid-cols-2"
			onSubmit={handleSubmit(onSubmit)}
		>
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
					<Field className="md:col-span-2">
						<FieldLabel>Assigned Stores</FieldLabel>
						<div className="grid gap-2 rounded-none border p-3 md:grid-cols-2">
							{stores.map((store) => (
								<label
									key={store.id}
									className="flex items-center gap-2 text-sm"
								>
									<input
										type="checkbox"
										checked={field.value.includes(store.id)}
										onChange={(event) => {
											if (event.target.checked) {
												field.onChange([...field.value, store.id]);
												return;
											}
											field.onChange(
												field.value.filter((value) => value !== store.id),
											);
										}}
										disabled={isSubmitting}
									/>
									<span>{`${store.code} - ${store.name}`}</span>
								</label>
							))}
						</div>
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
					icon={<Plus className="size-4" weight="duotone" />}
				>
					{isEditing ? "Update User" : "Create User"}
				</Button>
			</div>
		</form>
	);
}
