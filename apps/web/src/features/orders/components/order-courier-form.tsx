import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DialogFormActions } from "@/components/form/dialog-form-actions";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { useUpdateOrderCourierMutation } from "@/features/orders/hooks/useOrderMutations";
import { usersQueries } from "@/features/users/api";

interface OrderCourierFormProps {
	orderId: number;
	currentCourierId: string;
	closeDialog: () => void;
}

export const OrderCourierForm = ({
	orderId,
	currentCourierId,
	closeDialog,
}: OrderCourierFormProps) => {
	const [selectedCourierId, setSelectedCourierId] = useState(currentCourierId);
	const courierMutation = useUpdateOrderCourierMutation(orderId);

	const couriersQuery = useQuery(usersQueries.couriers());
	const courierOptions = [
		{ value: "none", label: "Walk-in (no courier)" },
		...(couriersQuery.data ?? []).map((courier) => ({
			value: String(courier.id),
			label: courier.name,
		})),
	];

	const isDirty = selectedCourierId !== currentCourierId;

	const handleSave = async () => {
		await courierMutation.mutateAsync(
			selectedCourierId ? Number(selectedCourierId) : null,
		);
		closeDialog();
	};

	return (
		<div className="grid gap-4">
			<SelectField
				className="w-full"
				disabled={courierMutation.isPending}
				items={courierOptions}
				onValueChange={(value) =>
					setSelectedCourierId(value === "none" ? "" : value)
				}
				placeholder="Walk-in (no courier)"
				value={selectedCourierId || "none"}
			/>
			<DialogFormActions
				submit={
					<Button
						disabled={courierMutation.isPending || !isDirty}
						onClick={handleSave}
						type="button"
					>
						{courierMutation.isPending ? "Saving…" : "Save Courier"}
					</Button>
				}
				onCancel={closeDialog}
				isPending={courierMutation.isPending}
			/>
		</div>
	);
};
