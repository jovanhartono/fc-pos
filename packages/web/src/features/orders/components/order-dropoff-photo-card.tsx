import { CameraIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { memo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ACCEPTED_IMAGE_TYPES,
	isAcceptedImage,
} from "@/features/orders/utils/photo-upload";
import {
	type OrderDetail,
	presignOrderDropoffPhoto,
	saveOrderDropoffPhoto,
	uploadFileToPresignedUrl,
} from "@/lib/api";

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
		const inputRef = useRef<HTMLInputElement | null>(null);

		const uploadMutation = useMutation({
			mutationFn: async (file: File) => {
				if (!isAcceptedImage(file.type)) {
					throw new Error("Unsupported image type");
				}

				const presigned = await presignOrderDropoffPhoto(order.id, {
					content_type: file.type,
				});
				await uploadFileToPresignedUrl(presigned.upload_url, file, file.type);
				await saveOrderDropoffPhoto(order.id, {
					image_path: presigned.key,
				});
			},
			onSuccess: async () => {
				toast.success("Drop-off photo saved");
				if (inputRef.current) {
					inputRef.current.value = "";
				}
				await onUploaded();
			},
			onError: (error: Error) => {
				toast.error(error.message || "Failed to save drop-off photo");
			},
		});

		const handleFileChange = useCallback(
			async (event: React.ChangeEvent<HTMLInputElement>) => {
				const file = event.target.files?.[0];
				if (!file) {
					return;
				}
				await uploadMutation.mutateAsync(file);
			},
			[uploadMutation],
		);

		const isSaved = Boolean(order.dropoff_photo_url);

		return (
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
							<img
								src={order.dropoff_photo_url}
								alt="Order drop-off"
								width={1280}
								height={800}
								className="aspect-16/10 w-full object-cover"
								loading="lazy"
							/>
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
					<input
						ref={inputRef}
						type="file"
						aria-label="Choose drop-off photo"
						accept={ACCEPTED_IMAGE_TYPES.join(",")}
						capture="environment"
						className="sr-only"
						onChange={handleFileChange}
					/>
					<Button
						type="button"
						variant="outline"
						className="h-11 w-full"
						icon={<CameraIcon className="size-4" />}
						loading={uploadMutation.isPending}
						loadingText="Uploading…"
						disabled={!canManage}
						onClick={() => inputRef.current?.click()}
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
		);
	},
);

OrderDropoffPhotoCard.displayName = "OrderDropoffPhotoCard";
