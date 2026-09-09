import dayjs from "@/lib/dayjs";
import { jakartaToday } from "@/shared/date-presets";

export function defaultRange(): { from: string; to: string } {
	const today = dayjs(jakartaToday());
	return {
		from: today.subtract(29, "day").format("YYYY-MM-DD"),
		to: today.format("YYYY-MM-DD"),
	};
}
