import { CameraIcon } from "@phosphor-icons/react";
import { memo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhotoLightbox } from "@/features/orders/components/photo-lightbox";
import { SinglePhotoUploadDialog } from "@/features/orders/components/photo-upload-dialog";
import { uploadOrderDropoffPhoto } from "@/features/orders/utils/photo-upload";
import type { OrderDetail } from "@/lib/api";

type OrderDropoffPhotoCardProps = {
	canManage: boolean;
	onUploaded: () => Promise<void>;
	order: Pick<
		OrderDetail,
		"id" | "dropoff_photo_url" | "dropoff_photo_uploaded_at" | "status"
	>;
};

export const OrderDropoffPhotoCard = memo(
	({ canManage, onUploaded, order }: OrderDropoffPhotoCardProps) => {
		const [isDialogOpen, setIsDialogOpen] = useState(false);
		const [isPreviewOpen, setIsPreviewOpen] = useState(false);

		const isSaved = Boolean(order.dropoff_photo_url);

		return (
			<>
				<Card>
					<CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
						<div className="min-w-0 space-y-1">
							<CardTitle className="text-base">Drop-off photo</CardTitle>
							<p className="text-muted-foreground text-sm">
								Proof the customer handed the items over. Uploading replaces the
								current file.
							</p>
						</div>
						<Badge variant={isSaved ? "secondary" : "outline"}>
							{isSaved ? "Saved" : "Missing"}
						</Badge>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="relative overflow-hidden border bg-muted">
							{order.dropoff_photo_url ? (
								<button
									type="button"
									className="block w-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
									onClick={() => setIsPreviewOpen(true)}
									aria-label="Open drop-off photo preview"
								>
									<img
										src={order.dropoff_photo_url}
										alt="Order drop-off"
										width={1280}
										height={800}
										className="aspect-16/10 w-full object-cover"
										loading="lazy"
									/>
								</button>
							) : (
								<div className="flex aspect-4/3 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground sm:aspect-16/10">
									<CameraIcon className="size-8 opacity-50" />
									<p className="text-sm">No drop-off photo yet</p>
								</div>
							)}
						</div>
						{order.dropoff_photo_uploaded_at ? (
							<p className="text-muted-foreground text-xs">
								Uploaded{" "}
								{new Date(order.dropoff_photo_uploaded_at).toLocaleString(
									"en-ID",
									{
										dateStyle: "medium",
										timeStyle: "short",
									},
								)}
							</p>
						) : null}
						<Button
							type="button"
							variant="outline"
							className="h-11 w-full"
							icon={<CameraIcon className="size-4" />}
							disabled={!canManage}
							onClick={() => setIsDialogOpen(true)}
						>
							{isSaved ? "Replace photo" : "Upload photo"}
						</Button>
						{canManage ? null : (
							<p className="text-muted-foreground text-xs">
								Cashiers and workers can update the drop-off photo.
							</p>
						)}
					</CardContent>
				</Card>
				{order.dropoff_photo_url ? (
					<PhotoLightbox
						open={isPreviewOpen}
						onOpenChange={setIsPreviewOpen}
						title="Drop-off photo"
						items={[
							{
								alt: "Order drop-off",
								created_at:
									order.dropoff_photo_uploaded_at ?? new Date().toISOString(),
								id: `dropoff-${order.id}`,
								image_url: order.dropoff_photo_url,
								primaryLabel: "Drop-off photo",
							},
						]}
					/>
				) : null}
				<SinglePhotoUploadDialog
					open={isDialogOpen}
					onOpenChange={setIsDialogOpen}
					title="Upload drop-off photo"
					badgeLabel="Drop-off"
					uploadPhoto={(input) => uploadOrderDropoffPhoto(order.id, input)}
					onUploaded={onUploaded}
				/>
			</>
		);
	},
);

OrderDropoffPhotoCard.displayName = "OrderDropoffPhotoCard";
