import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

// Plugins for Asia/Jakarta-aware formatting (reports). Importing from this
// module guarantees the plugins are extended before `.tz()` is called and
// makes `.tz()` type-visible project-wide.
dayjs.extend(utc);
dayjs.extend(timezone);

export const JAKARTA_TZ = "Asia/Jakarta";

export default dayjs;
