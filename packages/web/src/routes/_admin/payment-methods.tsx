import { PencilSimpleLine, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	PaymentMethodForm,
	type PaymentMethodFormState,
} from "@/features/payment-methods/components/payment-method-form";
import {
	createPaymentMethod,
	fetchPaymentMethods,
	type PaymentMethod,
	queryKeys,
	updatePaymentMethod,
} from "@/lib/api";
import { useGlobalSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/payment-methods")({
	component: PaymentMethodsPage,
});

function PaymentMethodsPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useGlobalSheet();

	const { data: paymentMethods = [], isPending } = useQuery({
		queryKey: queryKeys.paymentMethods,
		queryFn: fetchPaymentMethods,
	});
	const paymentMethodCount = paymentMethods.length;

	const createMutation = useMutation({
		mutationKey: ["create-payment-method"],
		mutationFn: createPaymentMethod,
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: queryKeys.paymentMethods,
			});
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
			closeSheet();
		},
	});

	const updateMutation = useMutation({
		mutationKey: ["update-payment-method"],
		mutationFn: ({
			id,
			payload,
		}: {
			id: number;
			payload: Parameters<typeof updatePaymentMethod>[1];
		}) => updatePaymentMethod(id, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: queryKeys.paymentMethods,
			});
			closeSheet();
		},
	});

	const handleOpenEditSheet = useCallback(
		(paymentMethod: PaymentMethod) => {
			openSheet({
				title: "Edit Payment Method",
				description: `Editing ID ${paymentMethod.id}`,
				content: (
					<PaymentMethodForm
						defaultValues={{
							name: paymentMethod.name,
							code: paymentMethod.code,
							is_active: paymentMethod.is_active,
						}}
						handleOnSubmit={async (values) => {
							await updateMutation.mutateAsync({
								id: paymentMethod.id,
								payload: values,
							});
						}}
						isEditing
						onReset={closeSheet}
					/>
				),
			});
		},
		[closeSheet, openSheet, updateMutation],
	);

	const handleOpenCreateSheet = useCallback(() => {
		openSheet({
			title: "Add Payment Method",
			description: "Create a new payment method",
			content: (
				<PaymentMethodForm
					handleOnSubmit={async (values: PaymentMethodFormState) => {
						await createMutation.mutateAsync(values);
					}}
					isEditing={false}
					onReset={closeSheet}
				/>
			),
		});
	}, [closeSheet, createMutation, openSheet]);

	const columns = useMemo<ColumnDef<PaymentMethod>[]>(
		() => [
			{ accessorKey: "name", header: "Payment Method" },
			{
				accessorKey: "code",
				header: "Code",
				cell: ({ row }) => (
					<span className="font-medium">{row.original.code}</span>
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
						onClick={() => handleOpenEditSheet(row.original)}
						icon={<PencilSimpleLine className="size-4" weight="duotone" />}
					>
						Edit
					</Button>
				),
			},
		],
		[handleOpenEditSheet],
	);

	return (
		<div className="grid gap-4">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<CardTitle>Payment Method List</CardTitle>
					<div className="flex items-center gap-2">
						<Badge
							variant={isPending ? "secondary" : "outline"}
						>{`${paymentMethodCount} items`}</Badge>
						<Button
							onClick={handleOpenCreateSheet}
							icon={<Plus className="size-4" weight="duotone" />}
						>
							Add Payment Method
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<DataTable
						columns={columns}
						data={paymentMethods}
						isLoading={isPending}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
