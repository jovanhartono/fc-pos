import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { ActiveBadge } from "@/components/active-badge";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { EditRowButton } from "@/components/edit-row-button";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
	createPaymentMethod,
	type PaymentMethod,
	paymentMethodsKeys,
	paymentMethodsQueries,
	updatePaymentMethod,
} from "@/features/payment-methods/api";
import {
	PaymentMethodForm,
	type PaymentMethodFormState,
} from "@/features/payment-methods/components/payment-method-form";
import { useSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/payment-methods")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(paymentMethodsQueries.list()),
	component: PaymentMethodsPage,
	// Past a second, the page itself draws with skeleton rows.
	pendingComponent: PaymentMethodsPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});

function PaymentMethodsPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const { data: paymentMethods = [], isPending } = useQuery(
		paymentMethodsQueries.list(),
	);

	const createMutation = useMutation({
		mutationKey: ["create-payment-method"],
		mutationFn: createPaymentMethod,
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: paymentMethodsKeys.all,
			});
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
				queryKey: paymentMethodsKeys.all,
			});
			closeSheet();
		},
	});

	const handleOpenEditSheet = useCallback(
		(paymentMethod: PaymentMethod) => {
			openSheet({
				title: "Edit Payment Method",
				content: () => (
					<PaymentMethodForm
						defaultValues={{
							name: paymentMethod.name,
							code: paymentMethod.code,
							is_active: paymentMethod.is_active,
							gateway: paymentMethod.gateway,
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
			content: () => (
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

	const columns = useMemo<DataTableColumnDef<PaymentMethod>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Payment method",
				meta: { kind: "name", width: { percent: 50, minRem: 9 } },
			},
			{
				accessorKey: "code",
				header: "Code",
				meta: { kind: "code", width: { percent: 26, minRem: 4.5 } },
			},
			{
				id: "status",
				header: "Status",
				meta: {
					width: { percent: 12, minRem: 4.5 },
					mobileCard: { slot: "status" },
				},
				cell: ({ row }) => <ActiveBadge isActive={row.original.is_active} />,
			},
			{
				id: "actions",
				header: "Actions",
				meta: {
					width: { percent: 12, minRem: 4.5 },
					mobileCard: { slot: "title-end" },
				},
				cell: ({ row }) => (
					<EditRowButton onClick={() => handleOpenEditSheet(row.original)} />
				),
			},
		],
		[handleOpenEditSheet],
	);

	return (
		<>
			<PageHeader
				title="Payment Methods"
				count={isPending ? undefined : paymentMethods.length}
				countNoun="payment method"
				actions={
					<Button
						onClick={handleOpenCreateSheet}
						icon={<HugeiconsIcon icon={Add01Icon} className="size-4" />}
					>
						Add Method
					</Button>
				}
			/>
			<ListPanel>
				<DataTable
					columns={columns}
					data={paymentMethods}
					isCardGrouped
					skeletonCardClassName="h-19"
					isLoading={isPending}
					sortable
					emptyMessage="No payment methods."
				/>
			</ListPanel>
		</>
	);
}
