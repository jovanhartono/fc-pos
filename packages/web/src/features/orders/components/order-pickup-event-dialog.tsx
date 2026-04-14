import { CameraIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	memo,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	ACCEPTED_IMAGE_TYPES,
	isAcceptedImage,
} from "@/features/orders/utils/photo-upload";
import {
	createOrderPickupEvent,
	type OrderDetail,
	presignOrderPickupEvent,
	queryKeys,
	uploadFileToPresignedUrl,
} from "@/lib/api";
import { formatOrderServiceItemDetails } from "@/lib/order-service-item-details";

type ReadyService = OrderDetail["services"][number];

type PickupDialogContextValue = {
	orderId: number;
	readyServices: ReadyService[];
	selectedIds: Set<number>;
	toggleService: (serviceId: number) => void;
	selectAll: () => void;
	clearSelection: () => void;
	file: File | null;
	previewUrl: string | null;
	setFile: (file: File | null) => void;
	submit: () => Promise<void>;
	isPending: boolean;
};

const PickupDialogContext = createContext<PickupDialogContextValue | null>(
	null,
);

const usePickupDialog = () => {
	const context = useContext(PickupDialogContext);
	if (!context) {
		throw new Error(
			"usePickupDialog must be used within OrderPickupEventDialog",
		);
	}
	return context;
};

type OrderPickupEventDialogProps = {
	closeDialog: () => void;
	orderId: number;
	readyServices: ReadyService[];
};

export const OrderPickupEventDialog = ({
	closeDialog,
	orderId,
	readyServices,
}: OrderPickupEventDialogProps) => {
	const queryClient = useQueryClient();
	const [selectedIds, setSelectedIds] = useState<Set<number>>(
		() => new Set(readyServices.map((service) => service.id)),
	);
	const [file, setFileState] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

	const toggleService = useCallback((serviceId: number) => {
		setSelectedIds((previous) => {
			const next = new Set(previous);
			if (next.has(serviceId)) {
				next.delete(serviceId);
			} else {
				next.add(serviceId);
			}
			return next;
		});
	}, []);

	const selectAll = useCallback(() => {
		setSelectedIds(new Set(readyServices.map((service) => service.id)));
	}, [readyServices]);

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	const pickupMutation = useMutation({
		mutationFn: async () => {
			if (!file) {
				throw new Error("A pickup photo is required");
			}
			if (!isAcceptedImage(file.type)) {
				throw new Error("Unsupported image type");
			}
			const serviceIds = Array.from(selectedIds);
			if (serviceIds.length === 0) {
				throw new Error("Select at least one item to pick up");
			}

			const presigned = await presignOrderPickupEvent(orderId, {
				content_type: file.type,
			});
			await uploadFileToPresignedUrl(presigned.upload_url, file, file.type);
			return createOrderPickupEvent(orderId, {
				image_path: presigned.key,
				service_ids: serviceIds,
			});
		},
		onSuccess: async () => {
			toast.success("Pickup recorded");
			await queryClient.invalidateQueries({
				queryKey: queryKeys.orderDetail(orderId),
			});
			await queryClient.invalidateQueries({ queryKey: ["orders"] });
			closeDialog();
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to record pickup");
		},
	});

	const submit = useCallback(async () => {
		await pickupMutation.mutateAsync();
	}, [pickupMutation]);

	const contextValue = useMemo<PickupDialogContextValue>(
		() => ({
			clearSelection,
			file,
			isPending: pickupMutation.isPending,
			orderId,
			previewUrl,
			readyServices,
			selectAll,
			selectedIds,
			setFile,
			submit,
			toggleService,
		}),
		[
			clearSelection,
			file,
			orderId,
			pickupMutation.isPending,
			previewUrl,
			readyServices,
			selectAll,
			selectedIds,
			setFile,
			submit,
			toggleService,
		],
	);

	return (
		<PickupDialogContext.Provider value={contextValue}>
			<div className="flex flex-col gap-5">
				<PickupServiceList />
				<PickupPhotoField />
				<PickupActions onCancel={closeDialog} />
			</div>
		</PickupDialogContext.Provider>
	);
};

const PickupServiceList = memo(() => {
	const {
		readyServices,
		selectedIds,
		toggleService,
		selectAll,
		clearSelection,
	} = usePickupDialog();

	if (readyServices.length === 0) {
		return (
			<p className="text-muted-foreground border bg-muted/30 px-3 py-4 text-sm">
				Nothing is ready for pickup yet.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-medium">
					Collecting {selectedIds.size} of {readyServices.length}
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
				{readyServices.map((service) => (
					<PickupServiceRow
						key={service.id}
						service={service}
						isSelected={selectedIds.has(service.id)}
						onToggle={toggleService}
					/>
				))}
			</ul>
		</div>
	);
});
PickupServiceList.displayName = "PickupServiceList";

type PickupServiceRowProps = {
	isSelected: boolean;
	onToggle: (serviceId: number) => void;
	service: ReadyService;
};

const PickupServiceRow = memo(
	({ isSelected, onToggle, service }: PickupServiceRowProps) => {
		const id = `pickup-service-${service.id}`;
		return (
			<li className="bg-card border px-3 py-2.5 text-sm">
				<Field orientation="horizontal">
					<Checkbox
						id={id}
						checked={isSelected}
						onCheckedChange={() => onToggle(service.id)}
					/>
					<div className="min-w-0 flex-1">
						<FieldLabel htmlFor={id} className="block font-medium leading-snug">
							{service.item_code ?? `Service #${service.id}`}
						</FieldLabel>
						<p className="text-muted-foreground text-xs">
							{service.service?.name ?? "Service"} ·{" "}
							{formatOrderServiceItemDetails(service)}
						</p>
					</div>
				</Field>
			</li>
		);
	},
);
PickupServiceRow.displayName = "PickupServiceRow";

const PickupPhotoField = memo(() => {
	const { file, previewUrl, setFile } = usePickupDialog();
	const inputRef = useRef<HTMLInputElement | null>(null);

	const handleFileChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const nextFile = event.target.files?.[0] ?? null;
			setFile(nextFile);
		},
		[setFile],
	);

	return (
		<div className="space-y-2">
			<p className="text-sm font-medium">
				Pickup photo <span className="text-muted-foreground">(required)</span>
			</p>
			<div className="bg-muted aspect-16/10 w-full overflow-hidden border">
				{previewUrl ? (
					<img
						src={previewUrl}
						alt="Pickup preview"
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
						<CameraIcon className="size-8 opacity-50" />
						<p className="text-sm">
							One photo of the customer collecting items
						</p>
					</div>
				)}
			</div>
			<input
				ref={inputRef}
				type="file"
				aria-label="Choose pickup photo"
				accept={ACCEPTED_IMAGE_TYPES.join(",")}
				className="sr-only"
				onChange={handleFileChange}
			/>
			<Button
				type="button"
				variant="outline"
				className="w-full"
				icon={<CameraIcon className="size-4" />}
				onClick={() => inputRef.current?.click()}
			>
				{file ? "Replace photo" : "Choose photo"}
			</Button>
		</div>
	);
});
PickupPhotoField.displayName = "PickupPhotoField";

const PickupActions = memo(({ onCancel }: { onCancel: () => void }) => {
	const { file, isPending, selectedIds, submit } = usePickupDialog();
	const isSubmitDisabled = !file || selectedIds.size === 0 || isPending;

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
