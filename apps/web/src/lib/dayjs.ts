import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

// Plugins for Asia/Jakarta-aware formatting (reports). Importing from this
// module guarantees the plugins are extended before `.tz()` is called and
// makes `.tz()` type-visible project-wide.
dayjs.extend(utc);
dayjs.extend(timezone);
// "3 weeks ago" beside a customer's last visit — how stale the relationship is
// reads faster than the date does.
dayjs.extend(relativeTime);

export const JAKARTA_TZ = "Asia/Jakarta";

// One date shape for every list: "19 Oct 15:09", with the year only once it
// is not this year's.
export const formatListDate = (value: Date | string) => {
	const date = dayjs(value);
	return date.format(
		date.year() === dayjs().year() ? "D MMM HH:mm" : "D MMM YYYY HH:mm",
	);
};

// A Shift's length, the same on Shifts, Attendance and Reports: "45m",
// "5h 05m", and "2d 2h" for one left open past a day.
export const formatShiftLength = (minutes: number) => {
	const total = Math.max(0, Math.floor(minutes));
	if (total < 60) {
		return `${total}m`;
	}
	if (total >= 24 * 60) {
		const days = `${Math.floor(total / (24 * 60))}d`;
		const hours = Math.floor((total % (24 * 60)) / 60);
		return hours === 0 ? days : `${days} ${hours}h`;
	}
	return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
};

export default dayjs;
