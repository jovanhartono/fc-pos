import dayjs from "dayjs";
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { z } from "zod";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// A day and a time, in the phone's time.
const LOCAL_FORMAT = "YYYY-MM-DDTHH:mm";

export const toLocalInput = (value: string) =>
	dayjs(value).format(LOCAL_FORMAT);

export const toIso = (value: string) => dayjs(value).toISOString();

export const shiftTimesSchema = z.object({
	clock_in_at: z.string().min(1, "Clock in is required"),
	clock_out_at: z.string().min(1, "Clock out is required"),
});

type ShiftTimeValues = z.infer<typeof shiftTimesSchema>;

export const checkClockOutAfterClockIn = (
	values: ShiftTimeValues,
	ctx: z.RefinementCtx,
) => {
	if (values.clock_out_at && values.clock_out_at <= values.clock_in_at) {
		ctx.addIssue({
			code: "custom",
			message: "Clock out must be after clock in",
			path: ["clock_out_at"],
		});
	}
};

const TIME_FIELDS = [
	{ name: "clock_in_at", label: "Clock in" },
	{ name: "clock_out_at", label: "Clock out" },
] as const;

interface DateTimeInputProps {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	isInvalid: boolean;
	isDisabled: boolean;
}

// The form keeps one "YYYY-MM-DDTHH:mm" value; it stays empty until both the
// day and the time are picked, so a half-filled field reads as missing.
const DateTimeInput = ({
	id,
	label,
	value,
	onChange,
	isInvalid,
	isDisabled,
}: DateTimeInputProps) => {
	const [draft, setDraft] = useState({ date: "", time: "" });
	const date = value ? value.slice(0, 10) : draft.date;
	const time = value ? value.slice(11, 16) : draft.time;

	const update = (next: { date: string; time: string }) => {
		setDraft(next);
		onChange(next.date && next.time ? `${next.date}T${next.time}` : "");
	};

	return (
		<div className="flex gap-2">
			<DatePicker
				id={id}
				value={date || undefined}
				onChange={(nextDate) => update({ date: nextDate ?? "", time })}
				disabled={isDisabled}
				iconLocation="right"
				className="min-w-0 flex-1"
			/>
			<Input
				id={`${id}-time`}
				type="time"
				aria-label={`${label} time`}
				value={time}
				onChange={(event) => update({ date, time: event.target.value })}
				// Safari on iPhone sizes the native picker to its own text and runs it
				// past the dialog's edge, so the admin can't reach Save.
				className="w-28 appearance-none dark:scheme-dark [&::-webkit-date-and-time-value]:text-left"
				aria-invalid={isInvalid}
				disabled={isDisabled}
			/>
		</div>
	);
};

interface ShiftTimeFieldsProps {
	isOnShift?: boolean;
}

export const ShiftTimeFields = ({
	isOnShift = false,
}: ShiftTimeFieldsProps) => {
	const { control, formState, getValues, setValue } =
		useFormContext<ShiftTimeValues>();

	return TIME_FIELDS.map(({ name, label }) => {
		const isOptional = isOnShift && name === "clock_out_at";
		return (
			<Controller
				key={name}
				name={name}
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor={`shift-${name}`} asterisk={!isOptional}>
							{label}
						</FieldLabel>
						<DateTimeInput
							id={`shift-${name}`}
							label={label}
							value={field.value}
							onChange={(next) => {
								field.onChange(next);
								// Most Shifts end the day they start, so the admin only types the hours.
								if (
									next &&
									name === "clock_in_at" &&
									!isOnShift &&
									!getValues("clock_out_at")
								) {
									setValue("clock_out_at", next);
								}
							}}
							isInvalid={fieldState.invalid}
							isDisabled={formState.isSubmitting}
						/>
						{isOptional ? (
							<FieldDescription>
								Leave empty while they're still on shift.
							</FieldDescription>
						) : null}
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		);
	});
};
