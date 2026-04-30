import { PUTUserSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilSimpleLineIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { FormProvider, type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	UserForm,
	type UserFormState,
} from "@/features/users/components/user-form";
import {
	createUser,
	queryKeys,
	type User,
	updateUser,
	updateUserStores,
} from "@/lib/api";
import { storesQueryOptions, usersPageQueryOptions } from "@/lib/query-options";
import { useSheet } from "@/stores/sheet-store";

const PAGE_SIZE = 25;

const usersSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
	search: z.string().trim().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_admin/users")({
	validateSearch: (search) => usersSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		Promise.all([
			context.queryClient.ensureQueryData(
				usersPageQueryOptions({
					limit: PAGE_SIZE,
					offset: (deps.page - 1) * PAGE_SIZE,
					...(deps.search ? { search: deps.search } : {}),
				}),
			),
			context.queryClient.ensureQueryData(storesQueryOptions()),
		]),
	component: UsersPage,
});

const userFormSchema = PUTUserSchema.extend({
	password: z.string().trim(),
	confirm_password: z.string().trim(),
	store_ids: z.array(z.number().int()),
	can_process_pickup: z.boolean(),
}).superRefine((data, ctx) => {
	if (data.password.length > 0 && data.password.length < 8) {
		ctx.addIssue({
			code: "custom",
			message: "Minimum 8 characters",
			path: ["password"],
		});
	}
	if (data.password !== data.confirm_password) {
		ctx.addIssue({
			code: "custom",
			message: "Password does not match",
			path: ["confirm_password"],
		});
	}
});

const defaultForm: UserFormState = {
	username: "",
	name: "",
	password: "",
	confirm_password: "",
	role: "cashier",
	is_active: true,
	can_process_pickup: false,
	store_ids: [],
};

function UsersPage() {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();
	const [editingUser, setEditingUser] = useState<User | null>(null);

	const handleSearchChange = useCallback(
		(next: string) => {
			void navigate({
				search: (prev) => ({
					...prev,
					page: 1,
					search: next || undefined,
				}),
			});
		},
		[navigate],
	);

	const form = useForm<UserFormState>({
		resolver: zodResolver(userFormSchema),
		defaultValues: defaultForm,
	});

	const usersQuery = useQuery(
		usersPageQueryOptions({
			limit: PAGE_SIZE,
			offset: (search.page - 1) * PAGE_SIZE,
			...(search.search ? { search: search.search } : {}),
		}),
	);
	const users = usersQuery.data?.items ?? [];
	const storesQuery = useQuery(storesQueryOptions());
	const storeMap = useMemo(
		() => new Map((storesQuery.data ?? []).map((store) => [store.id, store])),
		[storesQuery.data],
	);
	const userCount = usersQuery.data?.meta.total ?? 0;

	const resetForm = useCallback(() => {
		form.reset(defaultForm);
		setEditingUser(null);
		closeSheet();
	}, [form, closeSheet]);

	const createMutation = useMutation({
		mutationKey: ["create-user"],
		mutationFn: createUser,
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
	});

	const updateStoresMutation = useMutation({
		mutationKey: ["update-user-stores"],
		mutationFn: ({ id, store_ids }: { id: number; store_ids: number[] }) =>
			updateUserStores(id, { store_ids }),
	});

	const handleSubmit: SubmitHandler<UserFormState> = useCallback(
		async (values) => {
			if (editingUser) {
				const payload: Parameters<typeof updateUser>[1] = {
					username: values.username,
					name: values.name,
					role: values.role,
					is_active: values.is_active,
					can_process_pickup: values.can_process_pickup,
				};
				await updateMutation.mutateAsync({
					id: editingUser.id,
					payload,
				});
				await updateStoresMutation.mutateAsync({
					id: editingUser.id,
					store_ids: values.store_ids,
				});
				await queryClient.invalidateQueries({ queryKey: ["users"] });
				resetForm();
				return;
			}

			if (values.password.length < 8) {
				form.setError("password", { message: "Minimum 8 characters" });
				return;
			}

			const payload: Parameters<typeof createUser>[0] = {
				username: values.username,
				name: values.name,
				password: values.password,
				confirm_password: values.confirm_password,
				role: values.role,
				is_active: values.is_active,
				can_process_pickup: values.can_process_pickup,
			};

			const createdUser = await createMutation.mutateAsync(payload);
			const createdUserId = (createdUser as { data?: { id?: number } }).data
				?.id;
			if (createdUserId && values.store_ids.length > 0) {
				await updateStoresMutation.mutateAsync({
					id: createdUserId,
					store_ids: values.store_ids,
				});
			}
			await queryClient.invalidateQueries({ queryKey: ["users"] });
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
			resetForm();
		},
		[
			createMutation,
			editingUser,
			form,
			queryClient,
			resetForm,
			updateMutation,
			updateStoresMutation,
		],
	);

	const handleEdit = useCallback(
		(user: User) => {
			setEditingUser(user);
			form.reset({
				username: user.username,
				name: user.name,
				password: "",
				confirm_password: "",
				role: user.role,
				is_active: user.is_active,
				can_process_pickup: user.can_process_pickup ?? false,
				store_ids: user.userStores.map((item) => item.store_id),
			});
			openSheet({
				title: "Edit User",
				content: () => (
					<FormProvider {...form}>
						<UserForm
							onSubmit={handleSubmit}
							isEditing={true}
							stores={storesQuery.data ?? []}
							onReset={resetForm}
						/>
					</FormProvider>
				),
			});
		},
		[form, openSheet, storesQuery.data, resetForm, handleSubmit],
	);

	const handleCreate = useCallback(() => {
		setEditingUser(null);
		form.reset(defaultForm);
		openSheet({
			title: "Add User",
			content: () => (
				<FormProvider {...form}>
					<UserForm
						onSubmit={handleSubmit}
						isEditing={false}
						stores={storesQuery.data ?? []}
						onReset={resetForm}
					/>
				</FormProvider>
			),
		});
	}, [form, openSheet, storesQuery.data, resetForm, handleSubmit]);

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
				id: "stores",
				header: "Stores",
				cell: ({ row }) =>
					row.original.userStores.length > 0
						? row.original.userStores
								.map(
									(item) =>
										storeMap.get(item.store_id)?.code ?? String(item.store_id),
								)
								.join(", ")
						: "—",
			},
			{
				id: "actions",
				header: "Actions",
				cell: ({ row }) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleEdit(row.original)}
						icon={<PencilSimpleLineIcon className="size-4" />}
					>
						Edit
					</Button>
				),
			},
		],
		[handleEdit, storeMap],
	);

	return (
		<>
			<PageHeader
				title="Users"
				actions={
					<>
						<Badge
							variant={usersQuery.isPending ? "secondary" : "outline"}
						>{`${userCount} items`}</Badge>
						<Button
							icon={<PlusIcon className="size-4" />}
							onClick={handleCreate}
						>
							Add User
						</Button>
					</>
				}
			/>
			<div className="grid gap-4">
				<Card>
					<CardContent>
						<DebouncedSearchInput
							id="users-search"
							value={search.search ?? ""}
							onDebouncedChange={handleSearchChange}
							placeholder="Search by username or name"
							ariaLabel="Search users"
							className="mb-4 w-full sm:w-72"
						/>
						<div className="grid gap-4">
							<DataTable
								columns={columns}
								data={users}
								isLoading={usersQuery.isPending}
							/>
							<TablePagination
								meta={usersQuery.data?.meta}
								isLoading={usersQuery.isPending}
								onPageChange={(page) => {
									void navigate({
										search: (prev) => ({
											...prev,
											page,
										}),
									});
								}}
							/>
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
