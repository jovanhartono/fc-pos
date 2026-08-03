import { TicketIcon, XIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type {
	AppliedVoucher,
	TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { resolveVoucherCode } from "@/lib/api";
import { readServerErrorMessage } from "@/lib/server-error";

interface VoucherCodeEntryProps {
	storeId: number | undefined;
	subtotal: number;
}

export const VoucherCodeEntry = ({
	storeId,
	subtotal,
}: VoucherCodeEntryProps) => {
	const [code, setCode] = useState("");
	const form = useFormContext<TransactionDraftValues>();
	const appliedVouchers =
		useWatch({ control: form.control, name: "appliedVouchers" }) ?? [];

	const setAppliedVouchers = (next: AppliedVoucher[]) => {
		form.setValue("appliedVouchers", next, {
			shouldDirty: true,
			shouldValidate: true,
		});
	};

	const resolveMutation = useMutation({
		mutationFn: (voucherCode: string) =>
			resolveVoucherCode({
				code: voucherCode,
				store_id: storeId as number,
				gross_total: subtotal,
			}),
		onSuccess: (campaign, voucherCode) => {
			// One voucher per campaign per order (the server enforces the same via
			// order_campaigns' unique constraint): drop any existing entry for this
			// code OR this campaign before adding, so the same campaign can't be
			// applied twice and double-count in the price preview.
			setAppliedVouchers([
				...form
					.getValues("appliedVouchers")
					.filter(
						(entry) =>
							entry.code !== voucherCode && entry.campaign.id !== campaign.id,
					),
				{ code: voucherCode, campaign },
			]);
			setCode("");
		},
		// Opt out of the global error toast (main.tsx): the rejection is already
		// reported inline under the input, and the toast would repeat it verbatim.
		onError: () => undefined,
	});

	const trimmedCode = code.trim();
	const canApply =
		storeId !== undefined &&
		trimmedCode.length > 0 &&
		!resolveMutation.isPending;

	const handleApply = () => {
		if (!canApply) {
			return;
		}
		resolveMutation.mutate(trimmedCode);
	};

	return (
		<section className="grid gap-2">
			<Field orientation="horizontal">
				<FieldLabel className="sr-only" htmlFor="voucher-code">
					Voucher code
				</FieldLabel>
				<Input
					aria-invalid={resolveMutation.isError || undefined}
					autoCapitalize="characters"
					className="font-mono uppercase"
					disabled={storeId === undefined}
					id="voucher-code"
					onChange={(event) => {
						setCode(event.target.value.toUpperCase());
						if (resolveMutation.isError) {
							resolveMutation.reset();
						}
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							handleApply();
						}
					}}
					placeholder="Enter voucher code"
					value={code}
				/>
				<Button
					className="h-10 pointer-coarse:h-11"
					disabled={!canApply}
					icon={<TicketIcon />}
					loading={resolveMutation.isPending}
					onClick={handleApply}
					type="button"
					variant="outline"
				>
					Apply
				</Button>
			</Field>

			{resolveMutation.isError ? (
				<FieldError>
					{readServerErrorMessage(
						resolveMutation.error,
						"Failed to apply voucher code",
					)}
				</FieldError>
			) : null}

			{appliedVouchers.length > 0 ? (
				<ul className="flex flex-wrap gap-1.5">
					{appliedVouchers.map((entry) => (
						<li key={entry.code}>
							<span className="inline-flex items-center gap-1.5 border border-input bg-muted/40 pr-0 pl-2 text-xs">
								<span className="font-medium">{entry.campaign.name}</span>
								<span className="font-mono text-muted-foreground">
									{entry.code}
								</span>
								<Button
									aria-label={`Remove voucher ${entry.code}`}
									className="size-11"
									icon={<XIcon />}
									onClick={() =>
										setAppliedVouchers(
											form
												.getValues("appliedVouchers")
												.filter((applied) => applied.code !== entry.code),
										)
									}
									size="icon-xs"
									type="button"
									variant="ghost"
								/>
							</span>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
};
