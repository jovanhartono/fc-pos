import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export const JAKARTA_TZ = "Asia/Jakarta";

export const jakartaNow = () => dayjs().tz(JAKARTA_TZ);

export const jakartaDayStart = (date: Date | string) =>
  dayjs(date).tz(JAKARTA_TZ).startOf("day").toDate();

export const jakartaDayEnd = (date: Date | string) =>
  dayjs(date).tz(JAKARTA_TZ).endOf("day").toDate();
