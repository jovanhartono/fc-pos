import { Cancel01Icon, Coupon01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { resolveVoucherCode } from "@/features/campaigns/api";
import type { AppliedVoucher } from "@/features/transactions/cart/cart";
import { readServerErrorMessage } from "@/lib/server-error";

interface VoucherCodeEntryProps {
	storeId: number | undefined;
	subtotal: number;
	// Controlled: POS checkout keeps Voucher codes in its draft, the Order page's
	// Collect payment in its own form (ADR-0018).
	appliedVouchers: AppliedVoucher[];
	onChange: (next: AppliedVoucher[]) => void;
}

export const VoucherCodeEntry = ({
	storeId,
	subtotal,
	appliedVouchers,
	onChange,
}: VoucherCodeEntryProps) => {
	const [code, setCode] = useState("");

	const resolveMutation = useMutation({
		mutationFn: (voucherCode: string) =>
			resolveVoucherCode({
				code: voucherCode,
				store_id: storeId as number,
				gross_total: subtotal,
			}),
		onSuccess: (campaign, voucherCode) => {
			// One Voucher code per Campaign per Order, as the server enforces, so a
			// Campaign can't count twice in the price preview.
			onChange([
				...appliedVouchers.filter(
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
					className="uppercase tabular-nums placeholder:normal-case placeholder:tracking-normal"
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
					placeholder="Voucher code"
					value={code}
				/>
				<Button
					size="lg"
					disabled={!canApply}
					icon={<HugeiconsIcon icon={Coupon01Icon} />}
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
							<span className="inline-flex items-center gap-1.5 overflow-hidden rounded-sm border border-input bg-muted/40 pr-0 pl-2 text-footnote">
								<span className="font-medium">{entry.campaign.name}</span>
								<span className="text-muted-foreground tabular-nums">
									{entry.code}
								</span>
								<Button
									aria-label={`Remove voucher ${entry.code}`}
									className="size-11"
									icon={<HugeiconsIcon icon={Cancel01Icon} />}
									onClick={() =>
										onChange(
											appliedVouchers.filter(
												(applied) => applied.code !== entry.code,
											),
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
