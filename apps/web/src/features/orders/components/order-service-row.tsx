import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { OrderServiceDetail } from "@/features/orders/components/order-service-detail";
import type { OrderDetail } from "@/lib/api";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { useSheet } from "@/stores/sheet-store";

type OrderServiceRowService = OrderDetail["services"][number];

interface OrderServiceRowProps {
	orderId: number;
	service: OrderServiceRowService;
	isAdmin: boolean;
}

export const OrderServiceRow = memo(
	({ orderId, service, isAdmin }: OrderServiceRowProps) => {
		const openSheet = useSheet((s) => s.openSheet);

		const code = service.item_code ?? `Service #${service.id}`;
		const serviceName = service.service?.name ?? "Service";
		const itemDetails = getOrderServiceItemDetails(service);
		const handlerName = service.handler?.name;

		const handleClick = () => {
			openSheet({
				title: code,
				description: serviceName,
				content: () => (
					<OrderServiceDetail
						isAdmin={isAdmin}
						orderId={orderId}
						serviceId={service.id}
					/>
				),
			});
		};

		return (
			<button
				className="flex w-full items-start gap-3 border-t px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
				onClick={handleClick}
				type="button"
			>
				<span className="min-w-0 flex-1 space-y-1">
					<span className="block break-all font-mono text-[13px] font-semibold leading-snug">
						{code}
					</span>
					<span className="block text-sm leading-snug">{serviceName}</span>
					{itemDetails ? (
						<span className="block text-muted-foreground text-xs leading-snug">
							{itemDetails}
						</span>
					) : null}
					{handlerName ? (
						<span className="block text-muted-foreground text-xs leading-snug">
							Handler · {handlerName}
						</span>
					) : null}
				</span>
				<span className="flex shrink-0 flex-wrap justify-end gap-1.5">
					{service.is_priority ? (
						<Badge variant="warning">Priority</Badge>
					) : null}
					<Badge variant={getOrderServiceStatusBadgeVariant(service.status)}>
						{formatOrderServiceStatus(service.status)}
					</Badge>
				</span>
			</button>
		);
	},
);

OrderServiceRow.displayName = "OrderServiceRow";
