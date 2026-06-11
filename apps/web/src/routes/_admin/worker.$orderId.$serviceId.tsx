import { createFileRoute } from "@tanstack/react-router";
import { QueueServiceDetail } from "@/features/orders/components/queue-service-detail";
import { orderDetailQueryOptions } from "@/lib/query-options";

export const Route = createFileRoute("/_admin/worker/$orderId/$serviceId")({
	loader: async ({ context, params }) => {
		const orderId = Number(params.orderId);

		if (!Number.isInteger(orderId) || orderId <= 0) {
			return;
		}

		await context.queryClient.ensureQueryData(orderDetailQueryOptions(orderId));
	},
	component: WorkerQueueDetailPage,
});

function WorkerQueueDetailPage() {
	const { orderId, serviceId } = Route.useParams();
	const parsedOrderId = Number(orderId);
	const parsedServiceId = Number(serviceId);
	const isValid =
		Number.isInteger(parsedOrderId) &&
		parsedOrderId > 0 &&
		Number.isInteger(parsedServiceId) &&
		parsedServiceId > 0;

	if (!isValid) {
		return (
			<div className="grid gap-1 border border-destructive/40 bg-destructive/5 p-6 text-sm">
				<p className="font-medium">Invalid queue item</p>
				<p className="text-muted-foreground">
					The URL does not point to a valid queue item.
				</p>
			</div>
		);
	}

	return (
		<QueueServiceDetail orderId={parsedOrderId} serviceId={parsedServiceId} />
	);
}
