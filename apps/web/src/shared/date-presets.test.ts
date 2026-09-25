import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { getPresets, matchPreset } from "@/shared/date-presets";

afterEach(() => setSystemTime());

describe("matchPreset", () => {
	it("names the tapped preset when This month and Today share the 1st", () => {
		setSystemTime(new Date("2026-10-01T03:00:00Z"));
		const presets = getPresets();
		expect(
			matchPreset(presets, "2026-10-01", "2026-10-01", "thisMonth")?.id,
		).toBe("thisMonth");
		expect(matchPreset(presets, "2026-10-01", "2026-10-01")?.id).toBe("today");
	});
});
