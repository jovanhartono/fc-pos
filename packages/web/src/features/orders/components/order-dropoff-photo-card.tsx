import { CameraIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useRef, useState } from "react";
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
		const [selectedFile, setSelectedFile] = useState<File | null>(null);
		const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
				setSelectedFile(null);
				setPreviewUrl(null);
				if (inputRef.current) {
					inputRef.current.value = "";
				}
				await onUploaded();
			},
			onError: (error: Error) => {
				toast.error(error.message || "Failed to save drop-off photo");
			},
		});

		useEffect(() => {
			return () => {
				if (previewUrl) {
					URL.revokeObjectURL(previewUrl);
				}
			};
		}, [previewUrl]);

		const handleFileChange = useCallback(
			(event: React.ChangeEvent<HTMLInputElement>) => {
				const file = event.target.files?.[0] ?? null;
				setSelectedFile(file);
				setPreviewUrl((previous) => {
					if (previous) {
						URL.revokeObjectURL(previous);
					}
					return file ? URL.createObjectURL(file) : null;
				});
			},
			[],
		);

		const handleSave = useCallback(async () => {
			if (!selectedFile) {
				return;
			}
			await uploadMutation.mutateAsync(selectedFile);
		}, [selectedFile, uploadMutation]);

		const activePreviewUrl = previewUrl ?? order.dropoff_photo_url ?? null;
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
					<div className="bg-muted relative overflow-hidden border">
						{activePreviewUrl ? (
							<img
								src={activePreviewUrl}
								alt="Order drop-off"
								width={1280}
								height={800}
								className="aspect-16/10 w-full object-cover"
								loading="lazy"
							/>
						) : (
							<div className="text-muted-foreground flex aspect-16/10 flex-col items-center justify-center gap-2 px-6 text-center">
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
						className="sr-only"
						onChange={handleFileChange}
					/>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Button
							type="button"
							variant="outline"
							className="flex-1"
							icon={<CameraIcon className="size-4" />}
							disabled={!canManage}
							onClick={() => inputRef.current?.click()}
						>
							{isSaved ? "Replace photo" : "Choose photo"}
						</Button>
						<Button
							type="button"
							className="flex-1"
							icon={<UploadSimpleIcon className="size-4" />}
							loading={uploadMutation.isPending}
							loadingText="Uploading…"
							disabled={!selectedFile || !canManage}
							onClick={handleSave}
						>
							Save
						</Button>
					</div>
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
