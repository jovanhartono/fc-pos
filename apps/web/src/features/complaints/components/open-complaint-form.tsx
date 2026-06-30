import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon } from "@phosphor-icons/react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { OpenComplaintPayload } from "@/lib/api";
import { cn } from "@/lib/utils";

const openComplaintSchema = z.object({
	order_service_id: z.number().int().positive(),
	reason: z
		.string()
		.trim()
		.min(1, "Describe the complaint.")
		.max(2000, "Keep it under 2000 characters."),
	start_rework: z.boolean(),
});

type OpenComplaintValues = z.infer<typeof openComplaintSchema>;

export interface ComplaintLineOption {
	id: number;
	itemCode: string;
	serviceName: string;
	details: string;
}

type OpenComplaintMutation = UseMutationResult<
	unknown,
	Error,
	OpenComplaintPayload,
	unknown
>;

interface OpenComplaintFormProps {
	closeDialog: () => void;
	lines: ComplaintLineOption[];
	mutation: OpenComplaintMutation;
}

export const OpenComplaintForm = ({
	closeDialog,
	lines,
	mutation,
}: OpenComplaintFormProps) => {
	const form = useForm<OpenComplaintValues>({
		resolver: zodResolver(openComplaintSchema),
		defaultValues: {
			order_service_id: lines[0]?.id ?? 0,
			reason: "",
			start_rework: true,
		},
	});

	const isPending = mutation.isPending;

	const onSubmit = async (values: OpenComplaintValues) => {
		await mutation.mutateAsync(values);
		closeDialog();
	};

	return (
		<FormProvider {...form}>
			<form
				className="flex flex-col gap-5"
				onSubmit={form.handleSubmit(onSubmit)}
			>
				<Controller
					control={form.control}
					name="order_service_id"
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<p className="text-sm font-medium">Which item?</p>
							<div
								aria-label="Item with complaint"
								className="grid gap-2 sm:grid-cols-2"
								role="radiogroup"
							>
								{lines.map((line) => (
									<ComplaintLineCard
										disabled={isPending}
										isSelected={field.value === line.id}
										key={line.id}
										line={line}
										onSelect={() => field.onChange(line.id)}
									/>
								))}
							</div>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					control={form.control}
					name="reason"
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="complaint-reason">Reason</FieldLabel>
							<Textarea
								aria-invalid={fieldState.invalid}
								disabled={isPending}
								id="complaint-reason"
								onChange={field.onChange}
								placeholder="What is the customer unhappy about?"
								rows={4}
								value={field.value}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					control={form.control}
					name="start_rework"
					render={({ field }) => (
						<Field orientation="horizontal">
							<Checkbox
								checked={field.value}
								disabled={isPending}
								id="complaint-start-rework"
								onCheckedChange={(value) => field.onChange(Boolean(value))}
							/>
							<FieldLabel htmlFor="complaint-start-rework">
								Start rework now (free re-clean on this order)
							</FieldLabel>
						</Field>
					)}
				/>

				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button
						disabled={isPending}
						onClick={closeDialog}
						type="button"
						variant="outline"
					>
						Go back
					</Button>
					<Button disabled={isPending} type="submit">
						{isPending ? "Opening…" : "Open complaint"}
					</Button>
				</div>
			</form>
		</FormProvider>
	);
};

// Shared radio group name so the cards are mutually exclusive at the DOM level
// and get native arrow-key navigation.
const COMPLAINT_LINE_RADIO_NAME = "complaint-line";

interface ComplaintLineCardProps {
	disabled: boolean;
	isSelected: boolean;
	line: ComplaintLineOption;
	onSelect: () => void;
}

// A real (visually hidden) radio input wrapped by the styled card: native
// radiogroup semantics and keyboard behavior, with the full card as the touch
// target. order_service_id is unreadable on its own, so the card surfaces the
// item code, service, and item details (brand · color · model · size).
const ComplaintLineCard = ({
	disabled,
	isSelected,
	line,
	onSelect,
}: ComplaintLineCardProps) => (
	<label
		className={cn(
			"flex cursor-pointer items-start justify-between gap-3 border px-3 py-2.5 text-left transition active:scale-[0.99] has-[:focus-visible]:border-ring has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring/50",
			isSelected
				? "border-foreground ring-1 ring-foreground"
				: "border-border/70 hover:border-border hover:bg-muted/40",
			disabled && "cursor-not-allowed opacity-60",
		)}
	>
		<input
			checked={isSelected}
			className="sr-only"
			disabled={disabled}
			name={COMPLAINT_LINE_RADIO_NAME}
			onChange={onSelect}
			type="radio"
			value={line.id}
		/>
		<span className="min-w-0 flex-1 space-y-1">
			<span className="flex items-center gap-2">
				<span className="truncate font-medium text-sm">{line.itemCode}</span>
				<Badge className="shrink-0" variant="outline">
					{line.serviceName}
				</Badge>
			</span>
			<span className="block text-muted-foreground text-xs">
				{line.details}
			</span>
		</span>
		{isSelected ? (
			<CheckIcon className="mt-0.5 size-4 shrink-0" weight="bold" />
		) : null}
	</label>
);
