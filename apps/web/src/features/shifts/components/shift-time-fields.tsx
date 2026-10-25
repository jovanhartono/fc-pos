import dayjs from "dayjs";
import { Controller, useFormContext } from "react-hook-form";
import { z } from "zod";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// datetime-local's own format, in the phone's time.
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
						<Input
							{...field}
							onChange={(event) => {
								field.onChange(event);
								// Most Shifts end the day they start, so the admin only types the hours.
								if (
									name === "clock_in_at" &&
									!isOnShift &&
									!getValues("clock_out_at")
								) {
									setValue("clock_out_at", event.target.value);
								}
							}}
							id={`shift-${name}`}
							type="datetime-local"
							// Safari on iPhone sizes the native picker to its own text and runs it
							// past the dialog's edge, so the admin can't reach Save.
							className="appearance-none [&::-webkit-date-and-time-value]:text-left"
							aria-invalid={fieldState.invalid}
							disabled={formState.isSubmitting}
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
