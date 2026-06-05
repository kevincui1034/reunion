/**
 * Window selection — common_free → candidate windows.  [Owner: Jossue]
 *
 * Kevin's endpoint returns `common_free`: the intersection of free time across the
 * participants who have linked their calendar. We slice those ranges into bookable
 * trip windows, constrained to the trip's intended dates (`trips.timeframe`), and
 * return them best-first so planning can auto-pick `[0]` (DECISION 1).
 *
 * Because `common_free` is already an intersection over *resolved* participants,
 * everyone resolved is available in every returned window — so `availableUserIds`
 * is the resolved set and `conflictUserIds` is the pending set. Pure, no I/O.
 */
import type { CandidateWeekend } from "../../contracts/index.js";
import type { FreeRange } from "./calendarClient.js";
import type { DateRange } from "../what/timeframe.js";

const DAY = 24 * 60 * 60 * 1000;

export interface PickWindowOpts {
  /** Constrain windows to the trip's intended dates, if known. */
  timeframe?: DateRange | null;
  /** Minimum bookable window length (default 2 days — a weekend-ish trip). */
  minDays?: number;
  /** Maximum window length to propose (default 4 days). */
  maxDays?: number;
  /** Resolved participant handles → availableUserIds. */
  resolvedHandles?: string[];
  /** Pending participant handles → conflictUserIds. */
  pendingHandles?: string[];
}

export function pickWindow(commonFree: FreeRange[], opts: PickWindowOpts = {}): CandidateWeekend[] {
  const minMs = (opts.minDays ?? 2) * DAY;
  const maxMs = (opts.maxDays ?? 4) * DAY;
  const resolved = opts.resolvedHandles ?? [];
  const pending = opts.pendingHandles ?? [];
  const total = resolved.length + pending.length;

  const out: CandidateWeekend[] = [];
  for (const range of commonFree) {
    const clipped = opts.timeframe ? clip(range, opts.timeframe) : range;
    if (!clipped) continue;
    const span = clipped.end - clipped.start;
    if (span < minMs) continue;

    const start = clipped.start;
    const end = Math.min(clipped.end, start + maxMs);
    out.push({
      start,
      end,
      availableUserIds: resolved,
      conflictUserIds: pending,
      // Fraction of the whole group covered; 1 when everyone has resolved.
      score: total ? resolved.length / total : 1,
      label: formatRange(start, end),
    });
  }

  // Best-first: most coverage, then earliest.
  return out.sort((a, b) => b.score - a.score || a.start - b.start);
}

function clip(range: FreeRange, tf: DateRange): FreeRange | null {
  const start = Math.max(range.start, tf.start);
  const end = Math.min(range.end, tf.end);
  return end > start ? { start, end } : null;
}

/** "Jul 14–16" (same month) or "Jul 30 – Aug 2" (crossing months). */
function formatRange(start: number, end: number): string {
  const s = new Date(start);
  // end is exclusive; the human-facing last day is the day before.
  const lastDay = new Date(end - DAY);
  const sMon = s.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const eMon = lastDay.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const sd = s.getUTCDate();
  const ed = lastDay.getUTCDate();
  return sMon === eMon ? `${sMon} ${sd}–${ed}` : `${sMon} ${sd} – ${eMon} ${ed}`;
}
