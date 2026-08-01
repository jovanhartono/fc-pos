// Pins the Jakarta business-day boundary behind order numbering (the DDMMYYYY
// stamp on every receipt) and the created_at day filters on shifts and daily
// reports. If this boundary drifts, a 23:30 drop-off lands in the wrong day's
// revenue and tonight's order numbers restart a day early or late.
// Everything runs real — no mocks; only jakartaNow's wall clock is faked via
// setSystemTime, and it is reset in afterAll. The process TZ is pinned to UTC
// for the whole file: on a machine that already lives in WIB (like the shop's
// own laptop), dropping the timezone plugin changes nothing and every test
// here would stay green while production servers drift a day.
import { afterAll, describe, expect, it, setSystemTime } from "bun:test";
import dayjs from "dayjs";
import {
  JAKARTA_TZ,
  jakartaDayEnd,
  jakartaDayStart,
  jakartaNow,
} from "@/utils/date";

const originalTz = process.env.TZ;
process.env.TZ = "UTC";

afterAll(() => {
  if (originalTz === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTz;
  }
});

describe("jakartaDayStart", () => {
  it("keeps a 23:30 drop-off inside the same business day", () => {
    // 2026-08-01T16:30Z is 23:30 in Jakarta — still Aug 1 at the counter.
    expect(jakartaDayStart(new Date("2026-08-01T16:30:00Z"))).toEqual(
      new Date("2026-07-31T17:00:00.000Z")
    );
  });

  it("rolls an exactly-midnight order into the next business day", () => {
    // 17:00Z is the stroke of Jakarta midnight — the register has flipped.
    expect(jakartaDayStart(new Date("2026-08-01T17:00:00Z"))).toEqual(
      new Date("2026-08-01T17:00:00.000Z")
    );
  });

  it("lands on Jakarta midnight for Date and plain-date inputs alike", () => {
    // String inputs first parse in the process-local timezone, so the only
    // safe promise across deploy environments is the Jakarta wall clock.
    const inputs: (Date | string)[] = [
      new Date("2026-08-01T16:30:00Z"),
      "2026-08-01",
    ];
    for (const input of inputs) {
      expect(
        dayjs(jakartaDayStart(input)).tz(JAKARTA_TZ).format("HH:mm:ss.SSS")
      ).toBe("00:00:00.000");
    }
  });
});

describe("jakartaDayEnd", () => {
  it("closes the day at the last millisecond before Jakarta midnight", () => {
    expect(jakartaDayEnd(new Date("2026-08-01T16:30:00Z"))).toEqual(
      new Date("2026-08-01T16:59:59.999Z")
    );
  });

  it("spans exactly one civil day together with jakartaDayStart", () => {
    // Anything shorter drops orders; anything longer double-counts them.
    const input = new Date("2026-08-01T02:00:00Z");
    expect(
      jakartaDayEnd(input).getTime() - jakartaDayStart(input).getTime()
    ).toBe(86_399_999);
  });
});

describe("jakartaNow", () => {
  afterAll(() => {
    setSystemTime();
  });

  it("stamps order numbers with tomorrow's date once Jakarta passes midnight", () => {
    // 20:00Z on Aug 1 is 03:00 Aug 2 at the shop — receipts must say 02.
    setSystemTime(new Date("2026-08-01T20:00:00Z"));
    expect(jakartaNow().format("DDMMYYYY")).toBe("02082026");
  });

  it("carries the WIB offset — fails loudly if the timezone plugin is dropped", () => {
    expect(jakartaNow().utcOffset()).toBe(420);
  });
});
