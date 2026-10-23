import { CheckboxGroup } from "@base-ui/react/checkbox-group";
import { isHandedOverByPickup } from "@fresclean/api/schema";
import { Camera01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	memo,
	use,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import {
	createOrderPickupEvent,
	presignOrderPickupEvent,
} from "@/features/orders/api";
import { SinglePhotoCaptureDialog } from "@/features/orders/components/photo-upload-dialog";
import type { OrderItem } from "@/features/orders/lib/order-lines";
import { isAcceptedImage } from "@/features/orders/utils/photo-upload";
import { onOrderMoved } from "@/lib/cache-events";
import { uploadFileToPresignedUrl } from "@/lib/http";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { readServerErrorMessage } from "@/lib/server-error";
import { formatOrderServiceStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

type PickupDialogContextValue = {
	orderId: number;
	// The cashier hands back whole Items, never one OrderService on one
	// (ADR-0017); the server takes the same unit, so half a shoe can't leave.
	collectableItems: OrderItem[];
	selectedIds: number[];
	setSelectedIds: (ids: number[]) => void;
	selectAll: () => void;
	clearSelection: () => void;
	file: File | null;
	previewUrl: string | null;
	setFile: (file: File | null) => void;
	submit: () => Promise<void>;
	isPending: boolean;
};

type PickupCodeContextValue = {
	pickupCode: string;
	setPickupCode: (value: string) => void;
};

const PickupDialogContext = createContext<PickupDialogContextValue | null>(
	null,
);

const PickupCodeContext = createContext<PickupCodeContextValue | null>(null);

const usePickupDialog = () => {
	const context = use(PickupDialogContext);
	if (!context) {
		throw new Error(
			"usePickupDialog must be used within OrderPickupEventDialog",
		);
	}
	return context;
};

const usePickupCode = () => {
	const context = use(PickupCodeContext);
	if (!context) {
		throw new Error("usePickupCode must be used within OrderPickupEventDialog");
	}
	return context;
};

type OrderPickupEventDialogProps = {
	closeDialog: () => void;
	orderId: number;
	collectableItems: OrderItem[];
};

export const OrderPickupEventDialog = ({
	closeDialog,
	orderId,
	collectableItems,
}: OrderPickupEventDialogProps) => {
	const queryClient = useQueryClient();
	const [selectedIds, setSelectedIds] = useState<number[]>(
		// Only ready Items start ticked. A refunded Item is Collectable too, but
		// ticking it by default let a Customer collecting one pair leave with two.
		() =>
			collectableItems
				.filter((item) => item.status === "ready_for_pickup")
				.map((item) => item.id),
	);
	const [file, setFileState] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [pickupCode, setPickupCode] = useState("");

	useEffect(() => {
		return () => {
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	}, [previewUrl]);

	const setFile = useCallback((nextFile: File | null) => {
		setFileState(nextFile);
		setPreviewUrl((previous) => {
			if (previous) {
				URL.revokeObjectURL(previous);
			}
			return nextFile ? URL.createObjectURL(nextFile) : null;
		});
	}, []);

	const selectAll = useCallback(() => {
		setSelectedIds(collectableItems.map((item) => item.id));
	}, [collectableItems]);

	const clearSelection = useCallback(() => {
		setSelectedIds([]);
	}, []);

	const pickupMutation = useMutation({
		mutationFn: async () => {
			if (!file) {
				throw new Error("A pickup photo is required");
			}
			if (!isAcceptedImage(file.type)) {
				throw new Error("Unsupported image type");
			}
			if (!/^\d{6}$/.test(pickupCode)) {
				throw new Error("Enter the 6-digit pickup code");
			}
			if (selectedIds.length === 0) {
				throw new Error("Select at least one item to pick up");
			}

			const presigned = await presignOrderPickupEvent(orderId, {
				content_type: file.type,
			});
			await uploadFileToPresignedUrl(presigned.upload_url, file, file.type);
			return createOrderPickupEvent(orderId, {
				image_path: presigned.key,
				pickup_code: pickupCode,
				item_ids: selectedIds,
			});
		},
		onSuccess: async () => {
			toast.success("Pickup recorded");
			// A collected Item changes the counts on both /queue and /orders.
			await onOrderMoved(queryClient);
			closeDialog();
		},
		onError: (error: Error) => {
			toast.error(readServerErrorMessage(error, "Failed to record pickup"));
		},
	});

	const { mutateAsync: mutatePickup, isPending } = pickupMutation;
	const submit = useCallback(async () => {
		await mutatePickup();
	}, [mutatePickup]);

	const dialogValue = useMemo<PickupDialogContextValue>(
		() => ({
			clearSelection,
			file,
			isPending,
			orderId,
			previewUrl,
			collectableItems,
			selectAll,
			selectedIds,
			setFile,
			setSelectedIds,
			submit,
		}),
		[
			clearSelection,
			file,
			isPending,
			orderId,
			previewUrl,
			collectableItems,
			selectAll,
			selectedIds,
			setFile,
			submit,
		],
	);

	const codeValue = useMemo<PickupCodeContextValue>(
		() => ({ pickupCode, setPickupCode }),
		[pickupCode],
	);

	return (
		<PickupDialogContext.Provider value={dialogValue}>
			<PickupCodeContext.Provider value={codeValue}>
				<div className="flex flex-col gap-5">
					<PickupServiceList />
					<PickupCodeField />
					<PickupPhotoField />
					<PickupActions onCancel={closeDialog} />
				</div>
			</PickupCodeContext.Provider>
		</PickupDialogContext.Provider>
	);
};

const PickupCodeField = memo(() => {
	const { pickupCode, setPickupCode } = usePickupCode();
	const codeId = useId();

	return (
		<div className="space-y-2">
			<label htmlFor={codeId} className="block text-body font-medium">
				Pickup code{" "}
				<span className="text-muted-foreground">(6 digits, from customer)</span>
			</label>
			<InputOTP
				id={codeId}
				length={6}
				value={pickupCode}
				onValueChange={setPickupCode}
			>
				<InputOTPGroup>
					{Array.from({ length: 6 }, (_, index) => (
						<InputOTPSlot
							key={index}
							aria-label={index === 0 ? undefined : `Digit ${index + 1} of 6`}
							className="size-11 text-headline"
						/>
					))}
				</InputOTPGroup>
			</InputOTP>
		</div>
	);
});
PickupCodeField.displayName = "PickupCodeField";

const PickupServiceList = memo(() => {
	const {
		collectableItems,
		selectedIds,
		setSelectedIds,
		selectAll,
		clearSelection,
	} = usePickupDialog();

	if (collectableItems.length === 0) {
		return (
			<p className="text-muted-foreground rounded-md border bg-muted/30 px-3 py-4 text-body">
				Nothing is ready for pickup yet.
			</p>
		);
	}

	return (
		<CheckboxGroup
			className="space-y-2"
			value={selectedIds.map(String)}
			onValueChange={(next) => setSelectedIds(next.map(Number))}
		>
			<div className="flex items-center justify-between gap-2">
				<p className="text-body font-medium">
					Collecting{" "}
					<span className="tabular-nums">
						{selectedIds.length}/{collectableItems.length}
					</span>
				</p>
				<div className="flex gap-1.5">
					<Button type="button" size="sm" variant="outline" onClick={selectAll}>
						Select all
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={clearSelection}
					>
						Clear
					</Button>
				</div>
			</div>
			<ul className="grid max-h-64 gap-2 overflow-y-auto">
				{collectableItems.map((item) => (
					<PickupItemRow key={item.id} item={item} />
				))}
			</ul>
		</CheckboxGroup>
	);
});
PickupServiceList.displayName = "PickupServiceList";

type PickupItemRowProps = {
	item: OrderItem;
};

const PickupItemRow = memo(({ item }: PickupItemRowProps) => {
	const id = `pickup-item-${item.id}`;
	const details = getOrderServiceItemDetails(item);
	return (
		<li>
			<label
				htmlFor={id}
				className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border bg-card px-3 py-2.5 text-body"
			>
				<Checkbox id={id} value={String(item.id)} />
				<div className="min-w-0 flex-1">
					{/* What the cashier says out loud leads; the Item code reads second. */}
					<span className="block font-medium leading-snug">
						{details ?? item.item_code}
					</span>
					{details ? (
						<p className="text-caption text-muted-foreground tabular-nums">
							{item.item_code}
						</p>
					) : null}
					{/* Same rule the server uses for what a pickup covers. A refunded
					    line keeps its red badge: it changes what the cashier hands over. */}
					<p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground text-footnote">
						{item.services.filter(isHandedOverByPickup).map((treatment) => (
							<span
								className="inline-flex items-center gap-1"
								key={treatment.id}
							>
								{treatment.service?.name ?? "Service"}
								{treatment.status === "refunded" ? (
									<Badge variant="danger">
										{formatOrderServiceStatus(treatment.status)}
									</Badge>
								) : null}
							</span>
						))}
					</p>
				</div>
			</label>
		</li>
	);
});
PickupItemRow.displayName = "PickupItemRow";

const PickupPhotoField = memo(() => {
	const { previewUrl, setFile } = usePickupDialog();
	const [isCameraOpen, setIsCameraOpen] = useState(false);

	return (
		<div className="space-y-2">
			<p className="text-body font-medium">
				Pickup photo <span className="text-muted-foreground">(required)</span>
			</p>

			{/* Trigger + saved preview only — the full-screen dialog owns capture,
			    file picker, and review (see PhotoUpload mandate in AGENTS.md). */}
			<button
				aria-label={previewUrl ? "Retake pickup photo" : "Add pickup photo"}
				className={cn(
					"relative flex w-full items-center justify-center overflow-hidden rounded-md border",
					previewUrl
						? "aspect-4/3 bg-black sm:aspect-16/10"
						: "h-36 border-dashed bg-secondary",
				)}
				onClick={() => setIsCameraOpen(true)}
				type="button"
			>
				{previewUrl ? (
					<>
						<img
							alt="Pickup preview"
							className="size-full object-contain"
							src={previewUrl}
						/>
						<span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-center text-white text-footnote">
							Tap to retake
						</span>
					</>
				) : (
					<div className="flex flex-col items-center justify-center gap-2 text-primary">
						<HugeiconsIcon icon={Camera01Icon} className="size-8" />
						<span className="font-medium text-body">Add pickup photo</span>
					</div>
				)}
			</button>

			<SinglePhotoCaptureDialog
				autoOpenCamera={false}
				onCapture={setFile}
				onOpenChange={setIsCameraOpen}
				open={isCameraOpen}
				title="Pickup photo"
			/>
		</div>
	);
});
PickupPhotoField.displayName = "PickupPhotoField";

const PickupActions = memo(({ onCancel }: { onCancel: () => void }) => {
	const { file, isPending, selectedIds, submit } = usePickupDialog();
	const { pickupCode } = usePickupCode();
	const isSubmitDisabled =
		!file || selectedIds.length === 0 || pickupCode.length !== 6 || isPending;

	return (
		<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
			<Button variant="outline" onClick={onCancel}>
				Cancel
			</Button>
			<Button
				disabled={isSubmitDisabled}
				loading={isPending}
				loadingText="Saving…"
				onClick={submit}
			>
				Record pickup
			</Button>
		</div>
	);
});
PickupActions.displayName = "PickupActions";
