import {
	createFileRoute,
	type ErrorComponentProps,
} from "@tanstack/react-router";
import { DetailedError } from "hono/client";
import { z } from "zod";
import { ordersQueries } from "@/features/orders/api";
import {
	QueueServiceDetail,
	QueueServiceDetailMessage,
} from "@/features/orders/components/queue-service-detail";

const queueServiceParamsSchema = z.object({
	orderId: z.coerce.number().int().positive(),
	serviceId: z.coerce.number().int().positive(),
});

const QueueDetailPage = () => {
	const { orderId, serviceId } = Route.useParams();

	return <QueueServiceDetail orderId={orderId} serviceId={serviceId} />;
};

const QueueServiceRouteError = ({ error, reset }: ErrorComponentProps) => {
	if (error instanceof DetailedError && error.statusCode === 404) {
		return (
			<QueueServiceDetailMessage
				tone="muted"
				title="Queue item not found"
				description="It may have been removed or reassigned."
			/>
		);
	}

	return (
		<QueueServiceDetailMessage
			tone="error"
			title="Failed to load queue item"
			description={
				error instanceof Error ? error.message : "Please try again in a moment."
			}
			onRetry={reset}
		/>
	);
};

export const Route = createFileRoute("/_admin/queue/$orderId/$serviceId")({
	params: {
		parse: (params) => queueServiceParamsSchema.parse(params),
	},
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			ordersQueries.orderService(params.orderId, params.serviceId),
		);
	},
	component: QueueDetailPage,
	errorComponent: QueueServiceRouteError,
});
