import { describe, it, expect } from "vitest";
import { normalizeTimeframe, parseTimeframe } from "../src/planning/what/timeframe.js";

// Fixed reference: 2026-06-05.
const NOW = Date.UTC(2026, 5, 5);
const DAY = 24 * 60 * 60 * 1000;

describe("parseTimeframe", () => {
  it("parses an explicit ISO range (end inclusive of the last day)", () => {
    const r = parseTimeframe("2026-07-10..2026-07-20", NOW)!;
    expect(new Date(r.start).toISOString().slice(0, 10)).toBe("2026-07-10");
    // end is exclusive → 2026-07-21T00:00.
    expect(new Date(r.end).toISOString().slice(0, 10)).toBe("2026-07-21");
  });

  it("parses a bare month to that month's span, this year if not yet passed", () => {
    const r = parseTimeframe("july", NOW)!;
    expect(r.start).toBe(Date.UTC(2026, 6, 1));
    expect(r.end).toBe(Date.UTC(2026, 7, 1));
  });

  it("rolls a passed month to next year", () => {
    // March already passed by June → 2027.
    const r = parseTimeframe("march", NOW)!;
    expect(r.start).toBe(Date.UTC(2027, 2, 1));
  });

  it("honors an explicit year and a 3-letter prefix", () => {
    const r = parseTimeframe("jul 2028", NOW)!;
    expect(r.start).toBe(Date.UTC(2028, 6, 1));
  });

  it("returns null for non-concrete strings", () => {
    expect(parseTimeframe("sometime soon", NOW)).toBeNull();
    expect(parseTimeframe(null, NOW)).toBeNull();
  });
});

describe("normalizeTimeframe", () => {
  it("turns a month into an inclusive ISO range", () => {
    expect(normalizeTimeframe("July", NOW)).toBe("2026-07-01..2026-07-31");
  });

  it("passes an explicit range through as an inclusive ISO range", () => {
    expect(normalizeTimeframe("2026-07-10..2026-07-20", NOW)).toBe("2026-07-10..2026-07-20");
  });

  it("keeps a fuzzy string when no concrete range is derivable", () => {
    expect(normalizeTimeframe("sometime this summer", NOW)).toBe("sometime this summer");
  });

  it("returns null for null input", () => {
    expect(normalizeTimeframe(null, NOW)).toBeNull();
  });

  it("computes month length correctly for February", () => {
    expect(normalizeTimeframe("february", Date.UTC(2026, 0, 1))).toBe("2026-02-01..2026-02-28");
  });

  it("round-trips: the ISO range parses back to the same span as the month", () => {
    const monthRange = parseTimeframe("july", NOW)!;
    const iso = normalizeTimeframe("july", NOW)!;
    const isoRange = parseTimeframe(iso, NOW)!;
    expect(isoRange.start).toBe(monthRange.start);
    expect(isoRange.end).toBe(monthRange.end);
    expect(isoRange.end - isoRange.start).toBe(31 * DAY);
  });
});
