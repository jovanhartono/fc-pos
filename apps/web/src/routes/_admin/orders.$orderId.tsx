import { createFileRoute } from "@tanstack/react-router";
import { ordersQueries } from "@/features/orders/api";
import {
	OrderDetailMessage,
	OrderDetailView,
	OrderNotFound,
} from "@/features/orders/components/order-detail-view";
import { paymentMethodsQueries } from "@/features/payment-methods/api";
import { ensureOrNotFound } from "@/lib/server-error";

export const Route = createFileRoute("/_admin/orders/$orderId")({
	loader: async ({ context, params }) => {
		const id = Number(params.orderId);

		if (!Number.isInteger(id) || id <= 0) {
			return;
		}

		await ensureOrNotFound(
			Promise.all([
				context.queryClient.ensureQueryData(ordersQueries.detail(id)),
				context.queryClient.ensureQueryData(paymentMethodsQueries.list()),
			]),
		);
	},
	component: OrderDetailPage,
	// Past a second, the page draws its own Order-shaped skeleton, not the
	// generic placeholder.
	pendingComponent: OrderDetailPage,
	notFoundComponent: OrderNotFound,
	codeSplitGroupings: [["component", "pendingComponent"]],
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
