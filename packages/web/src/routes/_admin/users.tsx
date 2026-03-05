import { POSTUserSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilSimpleLineIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import {
	UserForm,
	type UserFormState,
} from "@/features/users/components/user-form";
import {
	createUser,
	fetchUsers,
	queryKeys,
	type User,
	updateUser,
} from "@/lib/api";

export const Route = createFileRoute("/_admin/users")({
	component: UsersPage,
});

const defaultForm: UserFormState = {
	username: "",
	name: "",
	password: "",
	confirm_password: "",
	role: "cashier",
	is_active: true,
};

function UsersPage() {
	const queryClient = useQueryClient();
	const [editingUser, setEditingUser] = useState<User | null>(null);
	const [isSheetOpen, setSheetOpen] = useState(false);

	const form = useForm<UserFormState>({
		resolver: zodResolver(POSTUserSchema),
		defaultValues: defaultForm,
	});

	const { data: users = [], isPending } = useQuery({
		queryKey: queryKeys.users,
		queryFn: fetchUsers,
	});
	const userCount = users.length;

	const resetForm = useCallback(() => {
		form.reset(defaultForm);
		setEditingUser(null);
		setSheetOpen(false);
	}, [form]);

	const createMutation = useMutation({
		mutationKey: ["create-user"],
		mutationFn: createUser,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.users });
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
			resetForm();
		},
	});

	const updateMutation = useMutation({
		mutationKey: ["update-user"],
		mutationFn: ({
			id,
			payload,
		}: {
			id: number;
			payload: Parameters<typeof updateUser>[1];
		}) => updateUser(id, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.users });
			resetForm();
		},
	});

	const isSubmitting = createMutation.isPending || updateMutation.isPending;

	const handleEdit = useCallback(
		(user: User) => {
			setEditingUser(user);
			form.reset({
				username: user.username,
				name: user.name,
				password: "placeholder1",
				confirm_password: "placeholder1",
				role: user.role,
				is_active: user.is_active,
			});
			setSheetOpen(true);
		},
		[form],
	);

	const columns = useMemo<ColumnDef<User>[]>(
		() => [
			{ accessorKey: "username", header: "Username" },
			{ accessorKey: "name", header: "Name" },
			{
				accessorKey: "role",
				header: "Role",
				cell: ({ row }) => (
					<span className="uppercase">{row.original.role}</span>
				),
			},
			{
				id: "status",
				header: "Status",
				cell: ({ row }) => (
					<Badge variant={row.original.is_active ? "success" : "danger"}>
						{row.original.is_active ? "Active" : "Inactive"}
					</Badge>
				),
			},
			{
				id: "actions",
				header: "Actions",
				cell: ({ row }) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleEdit(row.original)}
						icon={<PencilSimpleLineIcon className="size-4" weight="duotone" />}
					>
						Edit
					</Button>
				),
			},
		],
		[handleEdit],
	);

	const handleSubmit: SubmitHandler<UserFormState> = async (values) => {
		if (editingUser) {
			const payload: Parameters<typeof updateUser>[1] = {
				username: values.username,
				name: values.name,
				role: values.role,
				is_active: values.is_active,
			};
			await updateMutation.mutateAsync({
				id: editingUser.id,
				payload,
			});
			return;
		}

		const payload: Parameters<typeof createUser>[0] = {
			username: values.username,
			name: values.name,
			password: values.password,
			confirm_password: values.confirm_password,
			role: values.role,
			is_active: values.is_active,
		};

		await createMutation.mutateAsync(payload);
	};

	return (
		<div className="grid gap-4">
			<Sheet open={isSheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
					<SheetHeader>
						<SheetTitle>{editingUser ? "Edit User" : "Add User"}</SheetTitle>
						<SheetDescription>
							{editingUser
								? `Editing ID ${editingUser.id}`
								: "Create a new user"}
						</SheetDescription>
					</SheetHeader>
					<UserForm
						control={form.control}
						handleSubmit={form.handleSubmit}
						onSubmit={handleSubmit}
						isSubmitting={isSubmitting}
						isEditing={!!editingUser}
						onReset={resetForm}
					/>
				</SheetContent>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0">
						<CardTitle>User List</CardTitle>
						<div className="flex items-center gap-2">
							<Badge
								variant={isPending ? "secondary" : "outline"}
							>{`${userCount} items`}</Badge>
							<SheetTrigger
								render={
									<Button
										icon={<PlusIcon className="size-4" weight="duotone" />}
										onClick={() => {
											setEditingUser(null);
											form.reset(defaultForm);
										}}
									/>
								}
							>
								Add User
							</SheetTrigger>
						</div>
					</CardHeader>
					<CardContent>
						<DataTable columns={columns} data={users} isLoading={isPending} />
					</CardContent>
				</Card>
			</Sheet>
		</div>
	);
}
