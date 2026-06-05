/**
 * Availability → candidate weekends.  [Owner: Kevin]
 *
 * Now backed by Kevin's REAL interval engine (`intervals.ts`, ported from his
 * calendar component) instead of a naive overlap check. For each Fri→Mon window
 * (ADR-011), we subtract each participant's busy time; a participant is available
 * when no busy time falls in the window. Availability-only, no event-priority
 * scoring in V1 (ADR-003).
 *
 * The mocked `BusyCalendar` (epoch-ms ranges) is what the demo feeds in; Kevin's
 * Google-Calendar path produces the same busy ranges in production.
 */
import type { AvailabilityQuery, CandidateWeekend } from "../../contracts/index.js";
import { subtractBusy, totalMs, type Interval } from "./intervals.js";

/** Busy ranges per user, in epoch ms. */
export type BusyCalendar = Record<string, Array<{ start: number; end: number }>>;

const DAY = 24 * 60 * 60 * 1000;

export function computeCandidateWeekends(
  query: AvailabilityQuery,
  calendar: BusyCalendar,
  opts: { from?: number; weeks?: number } = {},
): CandidateWeekend[] {
  const from = opts.from ?? Date.now();
  const weeks = opts.weeks ?? (query.monthsAhead ?? 3) * 4;
  const out: CandidateWeekend[] = [];

  for (let w = 0; w < weeks; w++) {
    const friday = nextFriday(from + w * 7 * DAY);
    const start = friday + 12 * 60 * 60 * 1000; // Fri midday
    const end = friday + 3 * DAY; // Mon
    const window = { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
    const windowMs = end - start;

    const available: string[] = [];
    const conflict: string[] = [];

    for (const user of query.participants) {
      const busy: Interval[] = (calendar[user] ?? []).map((b) => ({
        start: new Date(b.start).toISOString(),
        end: new Date(b.end).toISOString(),
      }));
      // Free for the whole weekend ⇒ no busy time clipped out of the window.
      const free = subtractBusy(window, busy);
      const fullyFree = totalMs(free) >= windowMs;
      (fullyFree ? available : conflict).push(user);
    }

    out.push({
      start,
      end,
      availableUserIds: available,
      conflictUserIds: conflict,
      score: query.participants.length ? available.length / query.participants.length : 0,
      label: formatWeekend(start, end),
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

function nextFriday(from: number): number {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun .. 5 Fri
  const delta = (5 - day + 7) % 7;
  return d.getTime() + delta * DAY;
}

function formatWeekend(start: number, end: number): string {
  const s = new Date(start);
  const e = new Date(end);
  const mon = s.toLocaleString("en-US", { month: "short" });
  return `${mon} ${s.getDate()}–${e.getDate()}`;
}
