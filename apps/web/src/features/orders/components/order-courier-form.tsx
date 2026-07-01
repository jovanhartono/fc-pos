import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { useUpdateOrderCourierMutation } from "@/features/orders/hooks/useOrderMutations";
import { usersPageQueryOptions } from "@/lib/query-options";

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

	const couriersQuery = useQuery(
		usersPageQueryOptions({ role: "courier", is_active: true }),
	);
	const courierOptions = useMemo(
		() => [
			{ value: "none", label: "Walk-in (no courier)" },
			...(couriersQuery.data?.items ?? []).map((courier) => ({
				value: String(courier.id),
				label: courier.name,
			})),
		],
		[couriersQuery.data],
	);

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
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button
					disabled={courierMutation.isPending}
					onClick={closeDialog}
					type="button"
					variant="outline"
				>
					Go back
				</Button>
				<Button
					disabled={courierMutation.isPending || !isDirty}
					onClick={handleSave}
					type="button"
				>
					{courierMutation.isPending ? "Saving…" : "Save courier"}
				</Button>
			</div>
		</div>
	);
};
