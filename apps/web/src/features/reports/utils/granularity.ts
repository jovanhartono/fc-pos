import dayjs from "dayjs";
import type { ReportGranularity } from "@/lib/api";

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

const monthLabelFormatter = new Intl.DateTimeFormat("en-ID", {
	month: "short",
	year: "2-digit",
});

const dayShortFormatter = new Intl.DateTimeFormat("en-ID", {
	day: "2-digit",
	month: "short",
});

export function bucketToLabel(
	bucket: string,
	granularity: ReportGranularity,
): string {
	if (granularity === "day") {
		return dayShortFormatter.format(new Date(`${bucket}T00:00:00+07:00`));
	}
	if (granularity === "month") {
		return monthLabelFormatter.format(new Date(`${bucket}-01T00:00:00+07:00`));
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
		const d = new Date(`${bucket}T00:00:00+07:00`);
		return d.toLocaleDateString("en-ID", {
			weekday: "short",
			day: "2-digit",
			month: "short",
			year: "numeric",
		});
	}
	if (granularity === "month") {
		return new Date(`${bucket}-01T00:00:00+07:00`).toLocaleDateString("en-ID", {
			month: "long",
			year: "numeric",
		});
	}
	if (granularity === "year") {
		return `Year ${bucket}`;
	}
	const [year, week] = bucket.split("-");
	return `Week ${week}, ${year}`;
}
