/**
 * Timeframe parsing + normalization.  [Owner: Jossue]
 *
 * RocketRide extracts a fuzzy timeframe string ("July", "jul", "july 2026") or an
 * explicit range. Kevin's calendar parser accepts both, but an ISO range produces a
 * tighter availability window — so we normalize to `YYYY-MM-DD..YYYY-MM-DD` whenever
 * a concrete range is derivable, and fall back to the fuzzy string otherwise (DECISION 4).
 *
 * `parseTimeframe` is the inverse used by pickWindow to constrain candidate windows
 * to the trip's intended dates.
 */

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
// "jul", "july", etc. → month index.
const MONTH_PREFIX: Record<string, number> = {};
MONTHS.forEach((name, i) => {
  MONTH_PREFIX[name.slice(0, 3)] = i;
});

const DAY = 24 * 60 * 60 * 1000;
const ISO_RANGE = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;

export interface DateRange {
  start: number; // epoch ms, inclusive
  end: number; // epoch ms, exclusive
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Parse a timeframe string into an absolute date range, or null if not concrete. */
export function parseTimeframe(raw: string | null, now: number = Date.now()): DateRange | null {
  if (!raw) return null;
  const tf = raw.trim().toLowerCase();

  const iso = tf.match(ISO_RANGE);
  if (iso) {
    const start = Date.parse(iso[1] + "T00:00:00Z");
    const end = Date.parse(iso[2] + "T00:00:00Z") + DAY; // make end inclusive of the last day
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) return { start, end };
    return null;
  }

  // "<month>" or "<month> <year>".
  const m = tf.match(/^([a-z]{3,9})(?:\s+(\d{4}))?$/);
  if (m) {
    const monthIdx = MONTH_PREFIX[m[1]!.slice(0, 3)];
    if (monthIdx === undefined) return null;
    const ref = new Date(now);
    let year = m[2] ? Number(m[2]) : ref.getUTCFullYear();
    // No explicit year and the month already passed this year → assume next year.
    if (!m[2] && monthIdx < ref.getUTCMonth()) year += 1;
    const start = Date.UTC(year, monthIdx, 1);
    const end = Date.UTC(year, monthIdx + 1, 1); // first of next month (exclusive)
    return { start, end };
  }

  return null;
}

/**
 * Normalize a timeframe for persistence to `trips.timeframe`. Returns an ISO range
 * when one is derivable, else the original fuzzy string (Kevin's parser still
 * accepts it), else null.
 */
export function normalizeTimeframe(raw: string | null, now: number = Date.now()): string | null {
  if (!raw) return null;
  const range = parseTimeframe(raw, now);
  if (!range) return raw; // not concrete — keep the fuzzy string
  // end is exclusive; the human-facing ISO range is inclusive of the last day.
  return `${isoDay(range.start)}..${isoDay(range.end - DAY)}`;
}
