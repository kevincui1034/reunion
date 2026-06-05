/**
 * Availability → candidate weekends.  [Owner: Kevin]
 *
 * STUB: computes Fri→Mon weekend windows from a mocked busy-calendar and ranks
 * them by fraction of participants free. Availability-only — no event-priority
 * scoring in V1 (ADR-003). Default weekend window Fri midday → Mon (ADR-011).
 *
 * Kevin replaces the mocked calendar with the real (mocked-for-demo) calendar
 * source; the CONTRACT (AvailabilityQuery → CandidateWeekend[]) holds.
 */
import type {
  AvailabilityQuery,
  CandidateWeekend,
} from "../../contracts/index.js";

/** Mocked busy ranges per user (epoch ms). Real version: mocks/calendar source. */
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
    const available: string[] = [];
    const conflict: string[] = [];

    for (const user of query.participants) {
      const busy = (calendar[user] ?? []).some((b) => overlaps(b.start, b.end, start, end));
      (busy ? conflict : available).push(user);
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

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function formatWeekend(start: number, end: number): string {
  const s = new Date(start);
  const e = new Date(end);
  const mon = s.toLocaleString("en-US", { month: "short" });
  return `${mon} ${s.getDate()}–${e.getDate()}`;
}
