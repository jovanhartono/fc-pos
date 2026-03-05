import { Plus } from "@phosphor-icons/react";
import {
	type Control,
	Controller,
	type SubmitHandler,
	type UseFormHandleSubmit,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
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
};

type UserFormProps = {
	control: Control<UserFormState>;
	handleSubmit: UseFormHandleSubmit<UserFormState>;
	onSubmit: SubmitHandler<UserFormState>;
	isSubmitting: boolean;
	isEditing: boolean;
	onReset: () => void;
};

export function UserForm({
	control,
	handleSubmit,
	onSubmit,
	isSubmitting,
	isEditing,
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
						<FieldLabel htmlFor="user-username">Username</FieldLabel>
						<Input
							{...field}
							id="user-username"
							placeholder="e.g. cashier01"
							aria-invalid={fieldState.invalid}
							disabled={isSubmitting || isEditing}
							required
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
						<FieldLabel htmlFor="user-name">Name</FieldLabel>
						<Input
							{...field}
							id="user-name"
							placeholder="e.g. Budi Santoso"
							aria-invalid={fieldState.invalid}
							disabled={isSubmitting}
							required
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
								<FieldLabel htmlFor="user-password">Password</FieldLabel>
								<Input
									{...field}
									id="user-password"
									type="password"
									placeholder="Enter password"
									aria-invalid={fieldState.invalid}
									disabled={isSubmitting}
									required
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
								<FieldLabel htmlFor="user-confirm-password">
									Confirm Password
								</FieldLabel>
								<Input
									{...field}
									id="user-confirm-password"
									type="password"
									placeholder="Confirm password"
									aria-invalid={fieldState.invalid}
									disabled={isSubmitting}
									required
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
					<Field className="flex-row items-center justify-between md:col-span-2">
						<FieldLabel htmlFor="user-active">Active</FieldLabel>
						<Switch
							id="user-active"
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
					icon={<Plus className="size-4" weight="duotone" />}
				>
					{isEditing ? "Update User" : "Create User"}
				</Button>
			</div>
		</form>
	);
}
