import { describe, expect, it } from "bun:test";
import { distanceKm } from "@/utils/geo";

// The number the Shifts page shows a manager when it says a worker clocked in
// 3.1 km from the branch. Pinned against the Kemang store's real pin, because
// the interesting distances here are small: tens of metres at the counter,
// where a formula that is only right at continental scale would read as a
// worker who left the shop.
const KEMANG = { latitude: -6.261_578, longitude: 106.812_735 };

// 6371 km * 1 degree in radians. One degree of latitude, anywhere.
const KM_PER_DEGREE_LATITUDE = 111.194_927;

describe("distanceKm", () => {
  it("is zero for the same spot", () => {
    expect(distanceKm(KEMANG, KEMANG)).toBe(0);
  });

  it("reads a worker at the counter as 30 m, not as zero", () => {
    const atTheCounter = {
      latitude: KEMANG.latitude + 0.000_27,
      longitude: KEMANG.longitude,
    };

    expect(distanceKm(atTheCounter, KEMANG)).toBeCloseTo(0.03, 3);
  });

  it("reads a worker clocking in from home as 3.1 km", () => {
    const fromHome = {
      latitude: KEMANG.latitude + 0.0279,
      longitude: KEMANG.longitude,
    };

    expect(distanceKm(fromHome, KEMANG)).toBeCloseTo(3.1, 2);
  });

  it("narrows a degree of longitude near the equator by the latitude's cosine", () => {
    const east = { latitude: KEMANG.latitude, longitude: KEMANG.longitude + 1 };
    const expected =
      KM_PER_DEGREE_LATITUDE * Math.cos((KEMANG.latitude * Math.PI) / 180);

    expect(distanceKm(KEMANG, east)).toBeCloseTo(expected, 2);
  });

  it("survives a store pinned with latitude and longitude swapped", () => {
    const swapped = { latitude: 6.261_578, longitude: -106.812_735 };

    // Nonsense, but a finite number rather than NaN: the clock-in still has to
    // record something the audit query can spot.
    expect(Number.isFinite(distanceKm(KEMANG, swapped))).toBe(true);
    expect(distanceKm(KEMANG, swapped)).toBeGreaterThan(10_000);
  });
});
