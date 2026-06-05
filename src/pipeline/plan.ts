/**
 * RocketRide step: memory-aware planning.  [Owner: Jossue]
 *
 * The orchestration core of the "what". Given an actionable destination-known
 * signal, it: persists trip state, pulls candidate weekends (Kevin's layer,
 * injected), and builds the recap. Returns a PlanResult that nextAction renders
 * into the single next move.
 *
 * `availability` is injected so this is unit-testable and Kevin's impl is swappable.
 */
import type { Clients } from "../config.js";
import type {
  AvailabilityQuery,
  CandidateWeekend,
  Trip,
  TripSignal,
} from "../contracts/index.js";
import type { RouteDecision } from "./route.js";
import { upsertTripFromSignal } from "../planning/what/tripState.js";
import { buildSummary } from "../planning/what/summary.js";

export type NextStep = "confirm-and-poll" | "gather-availability" | "summary";

export interface PlanResult {
  trip: Trip;
  signal: TripSignal;
  summary: string;
  candidates: CandidateWeekend[];
  nextStep: NextStep;
}

export interface PlanDeps {
  availability: (q: AvailabilityQuery) => CandidateWeekend[] | Promise<CandidateWeekend[]>;
}

export async function plan(
  signal: TripSignal,
  decision: RouteDecision,
  groupId: string,
  clients: Clients,
  deps: PlanDeps,
): Promise<PlanResult> {
  if (!decision.act) {
    throw new Error(`plan() called on non-actionable path: ${decision.reason}`);
  }

  const trip = await upsertTripFromSignal(signal, groupId, clients);

  const participantIds = signal.participants.map((p) => p.userId);
  const candidates = await deps.availability({ participants: participantIds, windowKind: "weekend" });

  // Decide the single next coordination move.
  // TODO(Jossue): richer policy — budget check, lodging poll, etc. For V1:
  //   - have candidates → confirm the trip and offer a date poll
  //   - no candidates yet → gather availability
  const nextStep: NextStep = candidates.length ? "confirm-and-poll" : "gather-availability";

  const summary = buildSummary(trip, signal, candidates);
  await clients.state.updateTrip(trip.id, { currentSummary: summary });

  return { trip: { ...trip, currentSummary: summary }, signal, summary, candidates, nextStep };
}
