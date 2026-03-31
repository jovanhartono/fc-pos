import { PencilSimpleLineIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	PaymentMethodForm,
	type PaymentMethodFormState,
} from "@/features/payment-methods/components/payment-method-form";
import {
	createPaymentMethod,
	type PaymentMethod,
	queryKeys,
	updatePaymentMethod,
} from "@/lib/api";
import { paymentMethodsQueryOptions } from "@/lib/query-options";
import { useSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/payment-methods")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(paymentMethodsQueryOptions()),
	component: PaymentMethodsPage,
});

function PaymentMethodsPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const { data: paymentMethods = [], isPending } = useQuery(
		paymentMethodsQueryOptions(),
	);
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
						icon={<PencilSimpleLineIcon className="size-4" />}
					>
						Edit
					</Button>
				),
			},
		],
		[handleOpenEditSheet],
	);

	return (
		<>
			<PageHeader
				title="Payment Methods"
				actions={
					<>
						<Badge
							variant={isPending ? "secondary" : "outline"}
						>{`${paymentMethodCount} items`}</Badge>
						<Button
							onClick={handleOpenCreateSheet}
							icon={<PlusIcon className="size-4" />}
						>
							Add Payment Method
						</Button>
					</>
				}
			/>
			<div className="grid gap-4">
				<Card>
					<CardContent className="pt-6">
						<DataTable
							columns={columns}
							data={paymentMethods}
							isLoading={isPending}
						/>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
