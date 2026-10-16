import { pluralize } from "@/shared/utils";

export const formatDays = (days: number) =>
	days === 0 ? "today" : pluralize(days, "day");
