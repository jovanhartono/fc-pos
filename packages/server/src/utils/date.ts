import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export const JAKARTA_TZ = "Asia/Jakarta";

export function jakartaNow() {
  return dayjs().tz(JAKARTA_TZ);
}

export function jakartaDayStart(date: Date | string) {
  return dayjs(date).tz(JAKARTA_TZ).startOf("day").toDate();
}

export function jakartaDayEnd(date: Date | string) {
  return dayjs(date).tz(JAKARTA_TZ).endOf("day").toDate();
}
