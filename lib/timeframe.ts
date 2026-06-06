/**
 * Parse the fuzzy `timeframe` string Photon/RocketRide write onto Trip rows into
 * a concrete ISO window. Falls back to a 90-day rolling window when the input
 * is missing or unrecognized.
 *
 * Recognized inputs (case-insensitive):
 *   - ISO range: "2026-07-10..2026-07-20"
 *   - Month name: "july", "july 2026" → 1st through last day of that month
 *   - Month abbrev: "jul"
 *   - null / empty / anything else → today through today + 90 days
 */
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const DEFAULT_HORIZON_DAYS = 90;

export interface Window {
  start: string; // 'YYYY-MM-DD'
  end: string;
  source: 'iso-range' | 'month' | 'fallback';
}

export function parseTimeframe(input: string | null | undefined, now: Date = new Date()): Window {
  const fallback = makeFallback(now);
  if (!input) return fallback;
  const s = input.trim().toLowerCase();
  if (!s) return fallback;

  // ISO range: YYYY-MM-DD..YYYY-MM-DD
  const rangeMatch = s.match(/^(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})$/);
  if (rangeMatch) {
    return { start: rangeMatch[1], end: rangeMatch[2], source: 'iso-range' };
  }

  // Month (optionally with year): "july", "july 2026", "jul 2026"
  const monthMatch = s.match(/^([a-z]+)(?:\s+(\d{4}))?$/);
  if (monthMatch) {
    const monthIdx = monthIndex(monthMatch[1]);
    if (monthIdx !== -1) {
      const year = monthMatch[2] ? Number(monthMatch[2]) : nextOccurrenceYear(now, monthIdx);
      const start = new Date(Date.UTC(year, monthIdx, 1));
      const end = new Date(Date.UTC(year, monthIdx + 1, 1)); // exclusive end = 1st of next month
      return { start: toYMD(start), end: toYMD(end), source: 'month' };
    }
  }

  return fallback;
}

function makeFallback(now: Date): Window {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + DEFAULT_HORIZON_DAYS);
  return { start: toYMD(start), end: toYMD(end), source: 'fallback' };
}

function monthIndex(token: string): number {
  const t = token.slice(0, 3);
  return MONTHS.findIndex((m) => m.startsWith(t));
}

function nextOccurrenceYear(now: Date, monthIdx: number): number {
  const y = now.getUTCFullYear();
  // If we're past this year's instance of the month, jump to next year.
  return now.getUTCMonth() > monthIdx ? y + 1 : y;
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}
