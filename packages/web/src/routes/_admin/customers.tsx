import { POSTCustomerSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilSimpleLine, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { CustomerSelect } from "@/components/customer-select";
import { DataTable } from "@/components/data-table";
import { ProductSelect } from "@/components/product-select";
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
	CustomerForm,
	type CustomerFormState,
} from "@/features/customers/components/customer-form";
import {
	type Customer,
	createCustomer,
	fetchCustomers,
	queryKeys,
	updateCustomer,
} from "@/lib/api";
import { normalizePhoneNumber } from "@/lib/phone-number";

export const Route = createFileRoute("/_admin/customers")({
	component: CustomersPage,
});

const defaultForm: CustomerFormState = {
	name: "",
	phone_number: "",
	email: "",
	address: "",
	origin_store_id: "",
};

const customerFormResolverSchema = z.object({
	...POSTCustomerSchema.shape,
	origin_store_id: z.preprocess(
		(value) => Number(value),
		POSTCustomerSchema.shape.origin_store_id,
	),
});

function CustomersPage() {
	const queryClient = useQueryClient();
	const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
	const [isSheetOpen, setSheetOpen] = useState(false);
	const [selectedCustomerId, setSelectedCustomerId] = useState("");
	const [selectedProductId, setSelectedProductId] = useState("");

	const form = useForm<CustomerFormState>({
		resolver: zodResolver(customerFormResolverSchema, undefined, {
			raw: true,
		}) as any,
		defaultValues: defaultForm,
	});

	const { data: customers = [], isPending } = useQuery({
		queryKey: queryKeys.customers,
		queryFn: fetchCustomers,
	});
	const customerCount = customers.length;

	const resetForm = useCallback(() => {
		form.reset(defaultForm);
		setEditingCustomer(null);
		setSheetOpen(false);
	}, [form]);

	const createMutation = useMutation({
		mutationKey: ["create-customer"],
		mutationFn: createCustomer,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.customers });
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
			resetForm();
		},
	});

	const updateMutation = useMutation({
		mutationKey: ["update-customer"],
		mutationFn: ({
			id,
			payload,
		}: {
			id: number;
			payload: Parameters<typeof updateCustomer>[1];
		}) => updateCustomer(id, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.customers });
			resetForm();
		},
	});

	const isSubmitting = createMutation.isPending || updateMutation.isPending;

	const handleEdit = useCallback(
		(customer: Customer) => {
			setEditingCustomer(customer);
			form.reset({
				name: customer.name,
				phone_number: customer.phone_number,
				email: customer.email ?? "",
				address: customer.address ?? "",
				origin_store_id: String(customer.origin_store_id),
			});
			setSheetOpen(true);
		},
		[form],
	);

	const columns = useMemo<ColumnDef<Customer>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Name",
			},
			{
				accessorKey: "phone_number",
				header: "Phone",
			},
			{
				accessorKey: "email",
				header: "Email",
				cell: ({ row }) => row.original.email ?? "-",
			},
			{
				id: "origin_store",
				header: "Origin Store",
				cell: ({ row }) => row.original.originStore?.name ?? "-",
			},
			{
				id: "actions",
				header: "Actions",
				cell: ({ row }) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleEdit(row.original)}
						icon={<PencilSimpleLine className="size-4" weight="duotone" />}
					>
						Edit
					</Button>
				),
			},
		],
		[handleEdit],
	);

	const handleSubmit: SubmitHandler<CustomerFormState> = async (values) => {
		const normalizedPhoneNumber = normalizePhoneNumber(values.phone_number);

		if (editingCustomer) {
			const payload: Parameters<typeof updateCustomer>[1] = {
				name: values.name,
				phone_number: normalizedPhoneNumber,
				email: values.email?.length ? values.email : undefined,
				address: values.address ?? "",
			};

			await updateMutation.mutateAsync({
				id: editingCustomer.id,
				payload,
			});
			return;
		}

		const payload: Parameters<typeof createCustomer>[0] = {
			name: values.name,
			phone_number: normalizedPhoneNumber,
			email: values.email?.length ? values.email : undefined,
			address: values.address ?? "",
			origin_store_id: Number(values.origin_store_id),
		};

		await createMutation.mutateAsync(payload);
	};

	return (
		<div className="grid gap-4">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<CardTitle>Quick Select</CardTitle>
					<Badge variant="outline">Customer & Product</Badge>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					<CustomerSelect
						id="quick-customer-select"
						label="Customer Select"
						value={selectedCustomerId}
						onValueChange={setSelectedCustomerId}
					/>
					<ProductSelect
						id="quick-product-select"
						label="Product Select"
						value={selectedProductId}
						onValueChange={setSelectedProductId}
					/>
				</CardContent>
			</Card>

			<Sheet open={isSheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
					<SheetHeader>
						<SheetTitle>
							{editingCustomer ? "Edit Customer" : "Add Customer"}
						</SheetTitle>
						<SheetDescription>
							{editingCustomer
								? `Editing ID ${editingCustomer.id}`
								: "Create a new customer record"}
						</SheetDescription>
					</SheetHeader>
					<CustomerForm
						control={form.control}
						handleSubmit={form.handleSubmit}
						onSubmit={handleSubmit}
						isSubmitting={isSubmitting}
						isEditing={!!editingCustomer}
						onReset={resetForm}
					/>
				</SheetContent>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0">
						<CardTitle>Customer List</CardTitle>
						<div className="flex items-center gap-2">
							<Badge
								variant={isPending ? "secondary" : "outline"}
							>{`${customerCount} items`}</Badge>
							<SheetTrigger
								render={
									<Button
										icon={<Plus className="size-4" weight="duotone" />}
										onClick={() => {
											setEditingCustomer(null);
											form.reset(defaultForm);
										}}
									/>
								}
							>
								Add Customer
							</SheetTrigger>
						</div>
					</CardHeader>
					<CardContent>
						<DataTable
							columns={columns}
							data={customers}
							isLoading={isPending}
						/>
					</CardContent>
				</Card>
			</Sheet>
		</div>
	);
}
