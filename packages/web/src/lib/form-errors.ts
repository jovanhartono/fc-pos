import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ZodIssue } from "zod";

export function applySchemaErrors<TFieldValues extends FieldValues>(
	issues: ZodIssue[],
	setError: UseFormSetError<TFieldValues>,
	fieldMap?: Record<string, Path<TFieldValues>>,
) {
	let hasMappedError = false;

	for (const issue of issues) {
		const key = String(issue.path[0] ?? "");
		const mappedField = fieldMap?.[key] ?? (key as Path<TFieldValues>);
		if (!mappedField) {
			continue;
		}

		setError(mappedField, {
			type: "manual",
			message: issue.message,
		});
		hasMappedError = true;
	}

	return hasMappedError;
}
