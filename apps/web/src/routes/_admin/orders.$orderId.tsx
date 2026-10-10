import { createFileRoute } from "@tanstack/react-router";
import { ordersQueries } from "@/features/orders/api";
import {
	OrderDetailMessage,
	OrderDetailView,
} from "@/features/orders/components/order-detail-view";
import { paymentMethodsQueries } from "@/features/payment-methods/api";

export const Route = createFileRoute("/_admin/orders/$orderId")({
	loader: async ({ context, params }) => {
		const id = Number(params.orderId);

		if (!Number.isInteger(id) || id <= 0) {
			return;
		}

		await Promise.all([
			context.queryClient.ensureQueryData(ordersQueries.detail(id)),
			context.queryClient.ensureQueryData(paymentMethodsQueries.list()),
		]);
	},
	component: OrderDetailPage,
});

function OrderDetailPage() {
	const { orderId } = Route.useParams();
	const parsedOrderId = Number(orderId);
	const isValidOrderId = Number.isInteger(parsedOrderId) && parsedOrderId > 0;

	if (!isValidOrderId) {
		return (
			<OrderDetailMessage
				tone="error"
				title="Invalid order ID"
				description="The URL does not point to a valid order."
			/>
		);
	}

	return <OrderDetailView orderId={parsedOrderId} />;
}
