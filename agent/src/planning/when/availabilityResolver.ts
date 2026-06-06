/**
 * Availability resolver — the swap point between Kevin's live endpoint and the
 * in-process stub.  [Owner: Jossue]
 *
 * Mirrors the `resolveExtract` gate: real calendar client when configured AND
 * USE_STUBS=false, else the injected stub (the ported interval engine over the mock
 * calendar). Any failure of the live endpoint degrades to the stub — the demo never
 * dies because the calendar service blipped (PRD §13/§20).
 */
import type { CandidateWeekend, PendingConnect, Trip } from "../../contracts/index.js";
import { CalendarClient, type CalendarClientConfig } from "./calendarClient.js";
import { pickWindow } from "./pickWindow.js";
import { parseTimeframe } from "../what/timeframe.js";

export interface AvailabilityResult {
  candidates: CandidateWeekend[];
  pendingConnects: PendingConnect[];
}

export type AvailabilityResolver = (
  trip: Trip,
  participantIds: string[],
) => Promise<AvailabilityResult>;

export interface AvailabilityConfig {
  useStubs: boolean;
  calendar?: { baseUrl: string; internalKey: string };
}

/** Choose the availability implementation from config. */
export function resolveAvailability(
  cfg: AvailabilityConfig,
  stub: AvailabilityResolver,
): AvailabilityResolver {
  if (!cfg.useStubs && cfg.calendar) {
    return createCalendarResolver(cfg.calendar, stub);
  }
  return stub;
}

/**
 * Wire the real calendar HTTP client behind the resolver seam. `common_free` →
 * candidate windows via pickWindow, constrained to the trip's timeframe. Falls back
 * to `stub` on any error.
 */
export function createCalendarResolver(
  cfg: CalendarClientConfig,
  stub: AvailabilityResolver,
): AvailabilityResolver {
  const client = new CalendarClient(cfg);
  return async (trip, participantIds) => {
    try {
      const avail = await client.getAvailability(trip.id);
      const resolvedHandles = avail.participants
        .filter((p) => p.status === "resolved")
        .map((p) => p.handle);
      const pendingHandles = avail.participants
        .filter((p) => p.status === "needs_connect_link")
        .map((p) => p.handle);
      const candidates = pickWindow(avail.commonFree, {
        timeframe: parseTimeframe(trip.timeframe),
        resolvedHandles,
        pendingHandles,
      });
      return { candidates, pendingConnects: avail.pendingConnects };
    } catch {
      // Graceful degradation — the stub always produces a valid result.
      return stub(trip, participantIds);
    }
  };
}
