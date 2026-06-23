import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUpdateOrderCourierMutation } from "@/features/orders/hooks/useOrderMutations";
import type { OrderDetail } from "@/lib/api";
import { usersPageQueryOptions } from "@/lib/query-options";

interface OrderCourierCardProps {
	orderId: number;
	detail: OrderDetail;
	canManage: boolean;
}

export const OrderCourierCard = ({
	orderId,
	detail,
	canManage,
}: OrderCourierCardProps) => {
	const currentCourierId = detail.collected_by
		? String(detail.collected_by)
		: "";
	const [selectedCourierId, setSelectedCourierId] = useState(currentCourierId);
	const courierMutation = useUpdateOrderCourierMutation(orderId);

	const couriersQuery = useQuery({
		...usersPageQueryOptions({ role: "courier", is_active: true }),
		enabled: canManage,
	});
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

	if (!canManage) {
		if (!detail.collectedBy) {
			return null;
		}

		return (
			<Card>
				<CardHeader>
					<CardTitle>Courier</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm">{detail.collectedBy.name}</p>
				</CardContent>
			</Card>
		);
	}

	const isDirty = selectedCourierId !== currentCourierId;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Courier</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3">
				<SelectField
					items={courierOptions}
					value={selectedCourierId || "none"}
					onValueChange={(value) =>
						setSelectedCourierId(value === "none" ? "" : value)
					}
					placeholder="Walk-in (no courier)"
					disabled={courierMutation.isPending}
					className="w-full"
				/>
				<Button
					disabled={courierMutation.isPending || !isDirty}
					onClick={async () => {
						await courierMutation.mutateAsync(
							selectedCourierId ? Number(selectedCourierId) : null,
						);
					}}
				>
					Save courier
				</Button>
			</CardContent>
		</Card>
	);
};
