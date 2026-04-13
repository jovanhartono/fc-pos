import { CameraIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type OrderDetail,
	presignOrderIntakePhoto,
	saveOrderIntakePhoto,
	uploadFileToPresignedUrl,
} from "@/lib/api";

type OrderIntakePhotoCardProps = {
	canManage: boolean;
	onUploaded: () => Promise<void>;
	order: Pick<
		OrderDetail,
		"id" | "intake_photo_url" | "intake_photo_uploaded_at" | "status"
	>;
};

export function OrderIntakePhotoCard({
	canManage,
	onUploaded,
	order,
}: OrderIntakePhotoCardProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	const uploadMutation = useMutation({
		mutationFn: async (file: File) => {
			const contentType = file.type as
				| "image/jpeg"
				| "image/png"
				| "image/webp"
				| "image/heic";

			if (
				!["image/jpeg", "image/png", "image/webp", "image/heic"].includes(
					contentType,
				)
			) {
				throw new Error("Unsupported image type");
			}

			const presigned = await presignOrderIntakePhoto(order.id, {
				content_type: contentType,
			});
			await uploadFileToPresignedUrl(presigned.upload_url, file, contentType);
			await saveOrderIntakePhoto(order.id, {
				image_path: presigned.key,
			});
		},
		onSuccess: async () => {
			toast.success("Order intake photo saved");
			setSelectedFile(null);
			setPreviewUrl(null);
			if (inputRef.current) {
				inputRef.current.value = "";
			}
			await onUploaded();
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to save intake photo");
		},
	});

	useEffect(() => {
		return () => {
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	}, [previewUrl]);

	const activePreviewUrl = previewUrl ?? order.intake_photo_url ?? null;

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
				<div className="min-w-0 space-y-1">
					<CardTitle className="text-base">Intake photo</CardTitle>
					<p className="text-muted-foreground text-sm">
						One photo for the whole order at the counter. Uploading replaces the
						current file.
					</p>
				</div>
				<Badge variant={order.intake_photo_url ? "secondary" : "outline"}>
					{order.intake_photo_url ? "Saved" : "Missing"}
				</Badge>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="bg-muted relative overflow-hidden border">
					{activePreviewUrl ? (
						<img
							src={activePreviewUrl}
							alt="Order intake"
							width={1280}
							height={800}
							className="aspect-16/10 w-full object-cover"
							loading="lazy"
						/>
					) : (
						<div className="text-muted-foreground flex aspect-16/10 flex-col items-center justify-center gap-2 px-6 text-center">
							<CameraIcon className="size-8 opacity-50" />
							<p className="text-sm">No intake photo yet</p>
						</div>
					)}
				</div>
				{order.intake_photo_uploaded_at ? (
					<p className="text-muted-foreground text-xs">
						Uploaded{" "}
						{new Date(order.intake_photo_uploaded_at).toLocaleString("en-ID", {
							dateStyle: "medium",
							timeStyle: "short",
						})}
					</p>
				) : null}
				<input
					ref={inputRef}
					type="file"
					aria-label="Choose intake photo"
					accept="image/jpeg,image/png,image/webp,image/heic"
					className="sr-only"
					onChange={(event) => {
						const file = event.target.files?.[0] ?? null;
						setSelectedFile(file);
						setPreviewUrl((previous) => {
							if (previous) {
								URL.revokeObjectURL(previous);
							}

							return file ? URL.createObjectURL(file) : null;
						});
					}}
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
						{order.intake_photo_url ? "Replace photo" : "Choose photo"}
					</Button>
					<Button
						type="button"
						className="flex-1"
						icon={<UploadSimpleIcon className="size-4" />}
						loading={uploadMutation.isPending}
						loadingText="Uploading…"
						disabled={!selectedFile || !canManage}
						onClick={async () => {
							if (!selectedFile) {
								return;
							}

							await uploadMutation.mutateAsync(selectedFile);
						}}
					>
						Save
					</Button>
				</div>
				{!canManage ? (
					<p className="text-muted-foreground text-xs">
						Only admin and cashier can change the intake photo.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
