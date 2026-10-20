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

export default dayjs;
