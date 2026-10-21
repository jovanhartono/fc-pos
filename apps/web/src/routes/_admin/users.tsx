import { PUTUserSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyIcon, PlusIcon } from "@phosphor-icons/react";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { ActiveBadge } from "@/components/active-badge";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { EditRowButton } from "@/components/edit-row-button";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { storesQueries } from "@/features/stores/api";
import {
	createUser,
	type User,
	updateUser,
	updateUserStores,
	usersKeys,
	usersQueries,
} from "@/features/users/api";
import { ResetPasswordForm } from "@/features/users/components/reset-password-form";
import {
	UserForm,
	type UserFormState,
} from "@/features/users/components/user-form";
import { useDialog } from "@/stores/dialog-store";
import { useSheet } from "@/stores/sheet-store";

const PAGE_SIZE = 25;

const usersSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
	search: z.string().trim().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_admin/users")({
	validateSearch: (search) => usersSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps, cause }) => {
		// Typing a search or paging keeps the page up, the search box focused,
		// and swaps the rows in place.
		if (cause === "stay") {
			return;
		}
		await Promise.all([
			context.queryClient.ensureQueryData(
				usersQueries.list({
					limit: PAGE_SIZE,
					offset: (deps.page - 1) * PAGE_SIZE,
					...(deps.search ? { search: deps.search } : {}),
				}),
			),
			context.queryClient.ensureQueryData(storesQueries.list()),
		]);
	},
	component: UsersPage,
	// Past a second, the page itself draws with skeleton rows.
	pendingComponent: UsersPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
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
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);

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

	const usersQuery = useQuery({
		...usersQueries.list({
			limit: PAGE_SIZE,
			offset: (search.page - 1) * PAGE_SIZE,
			...(search.search ? { search: search.search } : {}),
		}),
		placeholderData: keepPreviousData,
	});
	const users = usersQuery.data?.items ?? [];
	const storesQuery = useQuery(storesQueries.list());
	const storeMap = useMemo(
		() => new Map((storesQuery.data ?? []).map((store) => [store.id, store])),
		[storesQuery.data],
	);

	const resetForm = useCallback(() => {
		form.reset(defaultForm);
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

	// The sheet keeps the handler it opened with, so the edited User travels with
	// it; read from state, it named the previous User and saved onto the wrong row.
	const saveUser = useCallback(
		async (values: UserFormState, editingUser: User | null) => {
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
				await queryClient.invalidateQueries({ queryKey: usersKeys.all });
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
			await queryClient.invalidateQueries({ queryKey: usersKeys.all });
			resetForm();
		},
		[
			createMutation,
			form,
			queryClient,
			resetForm,
			updateMutation,
			updateStoresMutation,
		],
	);

	const handleEdit = useCallback(
		(user: User) => {
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
				title: "Edit user",
				content: () => (
					<FormProvider {...form}>
						<UserForm
							onSubmit={(values) => saveUser(values, user)}
							isEditing={true}
							stores={storesQuery.data ?? []}
							onReset={resetForm}
						/>
					</FormProvider>
				),
			});
		},
		[form, openSheet, storesQuery.data, resetForm, saveUser],
	);

	const handleCreate = useCallback(() => {
		form.reset(defaultForm);
		openSheet({
			title: "Add user",
			content: () => (
				<FormProvider {...form}>
					<UserForm
						onSubmit={(values) => saveUser(values, null)}
						isEditing={false}
						stores={storesQuery.data ?? []}
						onReset={resetForm}
					/>
				</FormProvider>
			),
		});
	}, [form, openSheet, storesQuery.data, resetForm, saveUser]);

	const handleResetPassword = useCallback(
		(user: User) => {
			openDialog({
				title: "Reset password",
				description: `${user.name} · ${user.username}`,
				content: () => (
					<ResetPasswordForm userId={user.id} onDone={closeDialog} />
				),
			});
		},
		[openDialog, closeDialog],
	);

	const columns = useMemo<DataTableColumnDef<User>[]>(
		() => [
			{
				accessorKey: "username",
				header: "Username",
				meta: {
					kind: "code",
					width: { percent: 16, minRem: 7 },
					mobileCard: { slot: "subtitle" },
				},
			},
			{
				accessorKey: "name",
				header: "Name",
				meta: { kind: "name", width: { percent: 30, minRem: 9 } },
			},
			{
				accessorKey: "role",
				header: "Role",
				meta: {
					width: { percent: 11, minRem: 4.5 },
					mobileCard: { slot: "subtitle" },
				},
				cell: ({ row }) => (
					<span className="capitalize">{row.original.role}</span>
				),
			},
			{
				id: "stores",
				header: "Stores",
				meta: {
					width: { percent: 21, minRem: 9.5 },
					mobileCard: { slot: "subtitle" },
				},
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
				id: "status",
				header: "Status",
				meta: {
					width: { percent: 11, minRem: 4.5 },
					mobileCard: { slot: "status" },
				},
				cell: ({ row }) => <ActiveBadge isActive={row.original.is_active} />,
			},
			{
				id: "actions",
				header: "Actions",
				meta: {
					width: { percent: 11, minRem: 5.5 },
					mobileCard: { slot: "title-end" },
				},
				cell: ({ row }) => (
					<div className="flex gap-2">
						<EditRowButton onClick={() => handleEdit(row.original)} />
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Reset password"
							title="Reset password"
							onClick={() => handleResetPassword(row.original)}
							icon={<KeyIcon className="size-4" />}
						/>
					</div>
				),
			},
		],
		[handleEdit, handleResetPassword, storeMap],
	);

	return (
		<>
			<PageHeader
				title="Users"
				count={usersQuery.data?.meta.total}
				actions={
					<Button icon={<PlusIcon className="size-4" />} onClick={handleCreate}>
						Add user
					</Button>
				}
			/>
			<ListPanel>
				<DebouncedSearchInput
					id="users-search"
					value={search.search ?? ""}
					onDebouncedChange={handleSearchChange}
					placeholder="Search by username or name"
					ariaLabel="Search users"
					className="w-full sm:w-72"
				/>
				<DataTable
					columns={columns}
					data={users}
					isCardGrouped
					skeletonCardClassName="h-19"
					isLoading={usersQuery.isPending}
					isStale={usersQuery.isPlaceholderData}
					filterKey={JSON.stringify(search)}
					cardPrimaryColumnId="name"
					emptyMessage={
						search.search ? `No users match "${search.search}".` : "No users."
					}
					footer={
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
					}
				/>
			</ListPanel>
		</>
	);
}
