import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	PhotoLightbox,
	type PhotoLightboxItem,
} from "@/features/orders/components/photo-lightbox";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import type { OrderDetail } from "@/lib/api";

type PickupEvent = OrderDetail["pickup_events"][number];

interface OrderPickupHistoryCardProps {
	pickupEvents: PickupEvent[];
}

export const OrderPickupHistoryCard = ({
	pickupEvents,
}: OrderPickupHistoryCardProps) => {
	const [previewIndex, setPreviewIndex] = useState<number | null>(null);

	const eventsWithImage = pickupEvents
		.map((event, index) => ({ event, index }))
		.filter(({ event }) => Boolean(event.image_url));

	const lightboxItems: PhotoLightboxItem[] = eventsWithImage.map(
		({ event }) => {
			const pickedUpAt = formatOrderDateTime(event.picked_up_at);
			const pickedUpBy = event.picked_up_by?.name ?? "unknown operator";
			return {
				alt: `Pickup on ${pickedUpAt} by ${pickedUpBy}`,
				created_at: event.picked_up_at,
				id: `pickup-${event.id}`,
				image_url: event.image_url ?? "",
				primaryLabel: `Pickup · ${pickedUpBy}`,
			};
		},
	);

	const openPreview = (eventId: number) => {
		const indexInLightbox = eventsWithImage.findIndex(
			({ event }) => event.id === eventId,
		);
		if (indexInLightbox >= 0) {
			setPreviewIndex(indexInLightbox);
		}
	};

	return (
		<>
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Pickup history</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-3">
					{pickupEvents.map((event) => {
						const pickedUpAt = formatOrderDateTime(event.picked_up_at);
						const pickedUpBy = event.picked_up_by?.name ?? "unknown operator";

						return (
							<div key={event.id} className="grid gap-2 border p-2 text-sm">
								{event.image_url ? (
									<button
										type="button"
										className="block w-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
										onClick={() => openPreview(event.id)}
										aria-label={`Open pickup photo from ${pickedUpAt}`}
									>
										<img
											src={event.image_url}
											alt={`Pickup on ${pickedUpAt} by ${pickedUpBy}`}
											width={640}
											height={400}
											className="aspect-16/10 w-full border object-cover"
											loading="lazy"
										/>
									</button>
								) : null}
								<div className="grid gap-0.5">
									<p className="font-medium">{pickedUpAt}</p>
									<p className="text-muted-foreground text-xs">
										by {pickedUpBy}
									</p>
								</div>
							</div>
						);
					})}
				</CardContent>
			</Card>
			{lightboxItems.length > 0 ? (
				<PhotoLightbox
					open={previewIndex !== null}
					onOpenChange={(open) => {
						if (!open) {
							setPreviewIndex(null);
						}
					}}
					title="Pickup photo"
					items={lightboxItems}
					initialIndex={previewIndex ?? 0}
				/>
			) : null}
		</>
	);
};
