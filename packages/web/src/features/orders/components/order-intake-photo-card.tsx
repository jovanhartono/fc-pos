import { Camera, UploadSimple } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
				s3_key: presigned.key,
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
		<Card className="border-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(31,41,55,0.96)_55%,rgba(120,53,15,0.92))] text-slate-50 ring-1 ring-amber-300/25">
			<CardHeader className="border-b border-white/10">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-amber-200/80">
							Intake Capture
						</p>
						<CardTitle className="font-mono text-base text-white">
							One order-wide photo for the counter
						</CardTitle>
						<p className="max-w-xl text-xs text-slate-300">
							This is the single cashier intake photo for the entire order.
							Service lines can still collect their own progress and pickup
							photos afterward.
						</p>
					</div>
					<div className="rounded-full border border-amber-200/30 bg-amber-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-100">
						{order.intake_photo_url ? "Captured" : "Missing"}
					</div>
				</div>
			</CardHeader>
			<CardContent className="grid gap-4 pt-4 lg:grid-cols-[minmax(0,1.4fr)_220px]">
				<div className="grid gap-3">
					<div className="relative overflow-hidden border border-white/10 bg-black/20">
						{activePreviewUrl ? (
							<img
								src={activePreviewUrl}
								alt="Order intake"
								width={1280}
								height={800}
								className="aspect-[16/10] w-full object-cover"
								loading="lazy"
							/>
						) : (
							<div className="grid aspect-[16/10] place-items-center bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.22),transparent_45%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(30,41,59,0.84))] px-6 text-center">
								<div className="grid gap-2">
									<div className="mx-auto flex size-12 items-center justify-center rounded-full border border-white/15 bg-white/5">
										<Camera className="size-5" weight="duotone" />
									</div>
									<p className="font-mono text-sm text-white">
										No intake photo uploaded yet
									</p>
									<p className="text-xs text-slate-300">
										Cashier should capture this once when the order first lands
										at the desk.
									</p>
								</div>
							</div>
						)}
					</div>
					{order.intake_photo_uploaded_at ? (
						<p className="text-[11px] uppercase tracking-[0.24em] text-slate-300">
							Uploaded{" "}
							{new Date(order.intake_photo_uploaded_at).toLocaleString(
								"en-ID",
								{
									dateStyle: "medium",
									timeStyle: "short",
								},
							)}
						</p>
					) : null}
				</div>

				<div className="grid gap-3 border border-white/10 bg-black/15 p-4">
					<p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-300">
						Counter Action
					</p>
					<p className="text-xs text-slate-200">
						Only one intake slot exists for this order. Uploading again will
						replace the current photo.
					</p>
					<input
						ref={inputRef}
						type="file"
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
					<Button
						type="button"
						variant="secondary"
						className="h-11 justify-start border border-white/10 bg-white/10 text-white hover:bg-white/15"
						icon={<Camera className="size-4" weight="duotone" />}
						disabled={!canManage}
						onClick={() => inputRef.current?.click()}
					>
						{order.intake_photo_url
							? "Replace intake photo"
							: "Choose intake photo"}
					</Button>
					<Button
						type="button"
						className="h-11 justify-start bg-amber-300 text-slate-950 hover:bg-amber-200"
						icon={<UploadSimple className="size-4" weight="duotone" />}
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
						Save intake photo
					</Button>
					{!canManage ? (
						<p className="text-xs text-slate-400">
							Admin and cashier roles can manage the intake photo.
						</p>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}
