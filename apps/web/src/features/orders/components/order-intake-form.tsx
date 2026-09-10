import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { PostalCodeAutocomplete } from "@/features/orders/components/postal-code-autocomplete";
import { useUpdateOrderIntakeMutation } from "@/features/orders/hooks/useOrderMutations";
import {
	INTAKE_CHANNEL_ITEMS,
	intakeChannelCarries,
} from "@/features/orders/lib/intake-channel";
import type { IntakeChannel } from "@/lib/api";
import { usersPageQueryOptions } from "@/lib/query-options";

interface OrderIntakeFormProps {
	orderId: number;
	currentChannel: IntakeChannel;
	currentCourierId: string;
	currentPostalCode: string;
	currentPostalCodeLabel?: string;
	closeDialog: () => void;
}

export const OrderIntakeForm = ({
	orderId,
	currentChannel,
	currentCourierId,
	currentPostalCode,
	currentPostalCodeLabel,
	closeDialog,
}: OrderIntakeFormProps) => {
	const [channel, setChannel] = useState<IntakeChannel>(currentChannel);
	const [courierId, setCourierId] = useState(currentCourierId);
	const [postalCode, setPostalCode] = useState(currentPostalCode);
	const intakeMutation = useUpdateOrderIntakeMutation(orderId);

	const couriersQuery = useQuery(
		usersPageQueryOptions({ role: "courier", is_active: true }),
	);
	const courierOptions = useMemo(
		() =>
			(couriersQuery.data?.items ?? []).map((courier) => ({
				value: String(courier.id),
				label: courier.name,
			})),
		[couriersQuery.data],
	);

	const isDirty =
		channel !== currentChannel ||
		courierId !== currentCourierId ||
		postalCode !== currentPostalCode;
	const carries = intakeChannelCarries(channel);
	const isIncomplete = carries.courier && !courierId;

	const handleChannelChange = (value: string) => {
		const next = value as IntakeChannel;
		const nextCarries = intakeChannelCarries(next);
		setChannel(next);
		if (!nextCarries.courier) {
			setCourierId("");
		}
		if (!nextCarries.origin) {
			setPostalCode("");
		}
	};

	const handleSave = async () => {
		await intakeMutation.mutateAsync({
			collected_by: carries.courier ? Number(courierId) : null,
			intake_channel: channel,
			origin_postal_code: carries.origin && postalCode ? postalCode : null,
		});
		closeDialog();
	};

	return (
		<div className="grid gap-4">
			<Field>
				<FieldLabel htmlFor="order-intake-channel">How it arrived</FieldLabel>
				<SelectField
					className="w-full"
					disabled={intakeMutation.isPending}
					id="order-intake-channel"
					items={INTAKE_CHANNEL_ITEMS}
					onValueChange={handleChannelChange}
					value={channel}
				/>
			</Field>

			{carries.courier ? (
				<Field>
					<FieldLabel htmlFor="order-intake-courier">Courier</FieldLabel>
					<SelectField
						className="w-full"
						disabled={intakeMutation.isPending}
						id="order-intake-courier"
						items={courierOptions}
						onValueChange={setCourierId}
						placeholder="Pick the courier who collected it"
						value={courierId}
					/>
				</Field>
			) : null}

			{carries.origin ? (
				<PostalCodeAutocomplete
					disabled={intakeMutation.isPending}
					onValueChange={setPostalCode}
					value={postalCode}
					valueLabel={
						postalCode === currentPostalCode
							? currentPostalCodeLabel
							: undefined
					}
				/>
			) : null}

			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button
					disabled={intakeMutation.isPending}
					onClick={closeDialog}
					type="button"
					variant="outline"
				>
					Go back
				</Button>
				<Button
					disabled={intakeMutation.isPending || !isDirty || isIncomplete}
					onClick={handleSave}
					type="button"
				>
					{intakeMutation.isPending ? "Saving…" : "Save intake"}
				</Button>
			</div>
		</div>
	);
};
