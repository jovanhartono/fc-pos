import type { ReportGranularity } from "@/lib/api";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";

export function daysBetween(from: string, to: string): number {
	return dayjs(to).diff(dayjs(from), "day") + 1;
}

export function pickGranularity(from: string, to: string): ReportGranularity {
	const days = daysBetween(from, to);
	if (days <= 31) {
		return "day";
	}
	if (days <= 120) {
		return "week";
	}
	if (days <= 730) {
		return "month";
	}
	return "year";
}

export function bucketToLabel(
	bucket: string,
	granularity: ReportGranularity,
): string {
	if (granularity === "day") {
		return dayjs.tz(bucket, JAKARTA_TZ).format("DD MMM");
	}
	if (granularity === "month") {
		return dayjs.tz(`${bucket}-01`, JAKARTA_TZ).format("MMM YY");
	}
	if (granularity === "year") {
		return bucket;
	}
	const [, week] = bucket.split("-");
	return `W${week}`;
}

export function bucketToTooltipLabel(
	bucket: string,
	granularity: ReportGranularity,
): string {
	if (granularity === "day") {
		return dayjs.tz(bucket, JAKARTA_TZ).format("ddd, DD MMM YYYY");
	}
	if (granularity === "month") {
		return dayjs.tz(`${bucket}-01`, JAKARTA_TZ).format("MMMM YYYY");
	}
	if (granularity === "year") {
		return `Year ${bucket}`;
	}
	const [year, week] = bucket.split("-");
	return `Week ${week}, ${year}`;
}
