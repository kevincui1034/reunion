import { describe, it, expect } from "vitest";
import { subtractBusy, intersectFree, totalMs } from "../src/planning/when/intervals.js";
import { computeCandidateWeekends, type BusyCalendar } from "../src/planning/when/availability.js";
import { assertCandidateWeekend } from "../src/contracts/validate.js";

describe("interval engine (Kevin's ported math)", () => {
  it("subtracts busy time from a window", () => {
    const free = subtractBusy(
      { start: "2026-07-03", end: "2026-07-06" },
      [{ start: "2026-07-04T00:00:00Z", end: "2026-07-05T00:00:00Z" }],
    );
    // One busy day removed → two free spans around it.
    expect(free).toHaveLength(2);
    expect(totalMs(free)).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it("intersects free intervals across users", () => {
    const a = [{ start: "2026-07-03T00:00:00Z", end: "2026-07-05T00:00:00Z" }];
    const b = [{ start: "2026-07-04T00:00:00Z", end: "2026-07-06T00:00:00Z" }];
    const common = intersectFree([a, b]);
    expect(common).toHaveLength(1);
    expect(totalMs(common)).toBe(24 * 60 * 60 * 1000); // the overlapping day
  });
});

describe("computeCandidateWeekends (contract-facing)", () => {
  const from = Date.parse("2026-07-01T00:00:00Z"); // Wed → next Fri is Jul 3

  it("marks a user busy that weekend as a conflict, others available", () => {
    const calendar: BusyCalendar = {
      u_a: [{ start: Date.parse("2026-07-03T00:00:00Z"), end: Date.parse("2026-07-07T00:00:00Z") }],
      u_b: [],
    };
    const [weekend] = computeCandidateWeekends(
      { participants: ["u_a", "u_b"], windowKind: "weekend" },
      calendar,
      { from, weeks: 1 },
    );
    expect(weekend).toBeDefined();
    expect(weekend!.conflictUserIds).toContain("u_a");
    expect(weekend!.availableUserIds).toContain("u_b");
    expect(weekend!.score).toBeCloseTo(0.5);
    expect(() => assertCandidateWeekend(weekend!)).not.toThrow();
  });

  it("scores a fully-free weekend at 1 and sorts it first", () => {
    const calendar: BusyCalendar = { u_a: [], u_b: [] };
    const weekends = computeCandidateWeekends(
      { participants: ["u_a", "u_b"] },
      calendar,
      { from, weeks: 3 },
    );
    expect(weekends[0]!.score).toBe(1);
    for (const w of weekends) expect(() => assertCandidateWeekend(w)).not.toThrow();
  });
});
