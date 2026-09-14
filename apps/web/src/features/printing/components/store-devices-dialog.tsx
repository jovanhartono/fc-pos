import { BluetoothIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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

interface StoreDevicesDialogProps {
	storeId: number;
}

// Registered Bluetooth devices for one store. Registering opens Chrome's full
// device list once; after that the POS only ever offers what is listed here.
export const StoreDevicesDialog = ({ storeId }: StoreDevicesDialogProps) => {
	const queryClient = useQueryClient();
	const devicesQuery = useQuery(storesQueries.devices(storeId));
	const [pendingName, setPendingName] = useState<string | null>(null);
	const [label, setLabel] = useState("");

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: storesKeys.devices(storeId),
		});

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
			await invalidate();
		},
	});

	const removeMutation = useMutation({
		mutationFn: (deviceId: number) => deleteStoreDevice(storeId, deviceId),
		onSuccess: invalidate,
	});

	const devices = devicesQuery.data ?? [];

	return (
		<div className="grid gap-4">
			{devicesQuery.isSuccess && devices.length === 0 && (
				<p className="text-muted-foreground text-sm">
					No devices yet. Printing is off until one is registered.
				</p>
			)}
			{devices.length > 0 && (
				<ul className="divide-y border">
					{devices.map((device) => (
						<li
							key={device.id}
							className="flex items-center justify-between gap-3 px-3 py-2"
						>
							<div className="grid text-sm">
								<span className="font-medium">{device.name}</span>
								{device.label ? (
									<span className="text-muted-foreground">{device.label}</span>
								) : null}
							</div>
							<Button
								aria-label={`Remove ${device.name}`}
								variant="ghost"
								size="icon"
								disabled={removeMutation.isPending}
								onClick={() => removeMutation.mutate(device.id)}
							>
								<TrashIcon className="size-4" />
							</Button>
						</li>
					))}
				</ul>
			)}

			{pendingName === null ? (
				<Button
					variant="outline"
					loading={pairMutation.isPending}
					icon={<BluetoothIcon className="size-4" />}
					onClick={() => pairMutation.mutate()}
				>
					Register device
				</Button>
			) : (
				<form
					className="grid gap-3 border p-3"
					onSubmit={(event) => {
						event.preventDefault();
						registerMutation.mutate({
							name: pendingName,
							label: label.trim() || undefined,
						});
					}}
				>
					<p className="text-sm">
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
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={registerMutation.isPending}
							onClick={() => setPendingName(null)}
						>
							Cancel
						</Button>
						<Button type="submit" loading={registerMutation.isPending}>
							Save
						</Button>
					</div>
				</form>
			)}
		</div>
	);
};
