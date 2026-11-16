import { BluetoothIcon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DialogFormActions } from "@/components/form/dialog-form-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { pairBluetoothDevice } from "@/features/printing/web-bluetooth-transport";
import {
	deleteStoreDevice,
	registerStoreDevice,
	storesKeys,
	storesQueries,
} from "@/features/stores/api";
import { cn } from "@/lib/utils";
import { useDialog } from "@/stores/dialog-store";

interface StoreDevicesDialogProps {
	storeId: number;
}

// Registered Bluetooth devices for one Store. Registering opens Chrome's full
// device list once; after that the POS only ever offers what is listed here.
export const StoreDevicesDialog = ({ storeId }: StoreDevicesDialogProps) => {
	const queryClient = useQueryClient();
	const openDialog = useDialog((s) => s.openDialog);
	const devicesQuery = useQuery(storesQueries.devices(storeId));
	const [pendingName, setPendingName] = useState<string | null>(null);
	const [label, setLabel] = useState("");

	const pairMutation = useMutation({
		mutationFn: pairBluetoothDevice,
		onSuccess: (name) => setPendingName(name),
		onError: (error) => {
			// Closing the device list is how a cashier backs out of registering,
			// not a fault to shout about.
			if (error instanceof DOMException && error.name === "NotFoundError") {
				return;
			}
			toast.error(error.message);
		},
	});

	const registerMutation = useMutation({
		mutationFn: (payload: { name: string; label?: string }) =>
			registerStoreDevice(storeId, payload),
		onSuccess: async () => {
			setPendingName(null);
			setLabel("");
			await queryClient.invalidateQueries({
				queryKey: storesKeys.devices(storeId),
			});
		},
	});

	// The confirm takes this list's place in the one global dialog, so Cancel
	// and Remove both bring the Devices list back.
	const handleRemove = (device: { id: number; name: string }) => {
		const devicesDialog = useDialog.getState().dialogState;
		const reopenDevices = () => openDialog(devicesDialog);
		openDialog({
			title: `Remove "${device.name}"?`,
			description:
				"The POS stops printing to it until it's paired over Bluetooth again.",
			footer: () => (
				<RemoveDeviceActions
					storeId={storeId}
					deviceId={device.id}
					onDone={reopenDevices}
				/>
			),
		});
	};

	const devices = devicesQuery.data ?? [];
	// With nothing registered, registering is the only thing to do here.
	const isEmpty = devicesQuery.isSuccess && devices.length === 0;

	return (
		<div className="grid gap-4">
			{isEmpty ? (
				<p className="pt-2 text-center text-body">
					No devices yet. Printing is off until one is registered.
				</p>
			) : null}
			{devices.length > 0 && (
				<ul className="divide-y overflow-hidden rounded-md border">
					{devices.map((device) => (
						<li
							key={device.id}
							className="flex items-center justify-between gap-3 px-3 py-2"
						>
							<div className="grid text-body">
								<span className="font-medium">{device.name}</span>
								{device.label ? (
									<span className="text-muted-foreground">{device.label}</span>
								) : null}
							</div>
							<Button
								aria-label={`Remove ${device.name}`}
								variant="ghost"
								size="icon"
								onClick={() => handleRemove(device)}
							>
								<HugeiconsIcon icon={Delete02Icon} className="size-4" />
							</Button>
						</li>
					))}
				</ul>
			)}

			{pendingName === null ? (
				<Button
					variant={isEmpty ? "default" : "outline"}
					className={cn(isEmpty && "justify-self-center")}
					loading={pairMutation.isPending}
					icon={<HugeiconsIcon icon={BluetoothIcon} className="size-4" />}
					onClick={() => pairMutation.mutate()}
				>
					Register Device
				</Button>
			) : (
				<form
					className="grid gap-3 rounded-md border p-3"
					onSubmit={(event) => {
						event.preventDefault();
						registerMutation.mutate({
							name: pendingName,
							label: label.trim() || undefined,
						});
					}}
				>
					<p className="text-body">
						Connected to <span className="font-medium">{pendingName}</span>
					</p>
					<Field>
						<FieldLabel htmlFor="device-label">Label</FieldLabel>
						<Input
							id="device-label"
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							placeholder="e.g. Kasir 1"
							maxLength={64}
							disabled={registerMutation.isPending}
						/>
					</Field>
					<DialogFormActions
						submit={
							<Button type="submit" loading={registerMutation.isPending}>
								Save
							</Button>
						}
						onCancel={() => setPendingName(null)}
						isPending={registerMutation.isPending}
					/>
				</form>
			)}
		</div>
	);
};

interface RemoveDeviceActionsProps {
	storeId: number;
	deviceId: number;
	onDone: () => void;
}

const RemoveDeviceActions = ({
	storeId,
	deviceId,
	onDone,
}: RemoveDeviceActionsProps) => {
	const queryClient = useQueryClient();
	const removeMutation = useMutation({
		mutationFn: () => deleteStoreDevice(storeId, deviceId),
		onSuccess: async () => {
			// The list is closed behind this confirm, so refetch it anyway, or it
			// reopens still showing the printer just removed.
			await queryClient.invalidateQueries({
				queryKey: storesKeys.devices(storeId),
				refetchType: "all",
			});
			onDone();
		},
	});

	return (
		<>
			<Button
				variant="outline"
				onClick={onDone}
				disabled={removeMutation.isPending}
			>
				Cancel
			</Button>
			<Button
				variant="destructive"
				loading={removeMutation.isPending}
				onClick={() => removeMutation.mutate()}
			>
				Remove
			</Button>
		</>
	);
};
