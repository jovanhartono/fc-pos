import { CameraIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	memo,
	use,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
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
			if (!/^\d{6}$/.test(pickupCode)) {
				throw new Error("Enter the 6-digit pickup code");
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
				pickup_code: pickupCode,
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
			isPending,
			orderId,
			previewUrl,
			readyServices,
			selectAll,
			selectedIds,
			setFile,
			submit,
			toggleService,
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

	return (
		<div className="space-y-2">
			<p className="text-sm font-medium">
				Pickup code{" "}
				<span className="text-muted-foreground">(6 digits, from customer)</span>
			</p>
			<InputOTP
				maxLength={6}
				value={pickupCode}
				onChange={setPickupCode}
				autoComplete="one-time-code"
				inputMode="numeric"
				pattern="[0-9]*"
				containerClassName="justify-start"
			>
				<InputOTPGroup>
					<InputOTPSlot index={0} className="size-11 text-base" />
					<InputOTPSlot index={1} className="size-11 text-base" />
					<InputOTPSlot index={2} className="size-11 text-base" />
					<InputOTPSlot index={3} className="size-11 text-base" />
					<InputOTPSlot index={4} className="size-11 text-base" />
					<InputOTPSlot index={5} className="size-11 text-base" />
				</InputOTPGroup>
			</InputOTP>
		</div>
	);
});
PickupCodeField.displayName = "PickupCodeField";

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
			<li>
				<label
					htmlFor={id}
					className="flex min-h-11 cursor-pointer items-center gap-3 border bg-card px-3 py-2.5 text-sm"
				>
					<Checkbox
						id={id}
						checked={isSelected}
						onCheckedChange={() => onToggle(service.id)}
					/>
					<div className="min-w-0 flex-1">
						<span className="block font-medium leading-snug">
							{service.item_code ?? `Service #${service.id}`}
						</span>
						<p className="text-muted-foreground text-xs">
							{service.service?.name ?? "Service"} ·{" "}
							{formatOrderServiceItemDetails(service)}
						</p>
					</div>
				</label>
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
			<div className="aspect-4/3 w-full overflow-hidden border bg-muted sm:aspect-16/10">
				{previewUrl ? (
					<img
						src={previewUrl}
						alt="Pickup preview"
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
						<CameraIcon className="size-8 opacity-50" />
						<p className="text-sm">Photo of the customer collecting items</p>
					</div>
				)}
			</div>
			<input
				ref={inputRef}
				type="file"
				aria-label="Choose pickup photo"
				accept={ACCEPTED_IMAGE_TYPES.join(",")}
				capture="environment"
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
	const { pickupCode } = usePickupCode();
	const isSubmitDisabled =
		!file || selectedIds.size === 0 || pickupCode.length !== 6 || isPending;

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
