/**
 * "What do we know so far" summary.  [Owner: Jossue]
 *
 * Turns trip state + signal + candidate weekends into the short, chat-sized recap
 * the agent posts. Keep it terse (PRD §18) and preserve uncertainty (don't assert
 * unknowns). This is prime territory for the Butterbase model gateway later —
 * for now it's deterministic string assembly so the demo is stable.
 */
import type {
  Trip,
  TripSignal,
  CandidateWeekend,
  GroupBrief,
} from "../../contracts/index.js";
import { cultureLines } from "./culture.js";

export function buildSummary(
  trip: Trip,
  signal: TripSignal,
  candidates: CandidateWeekend[],
  cultureBrief?: GroupBrief | null,
): string {
  const lines: string[] = [];
  lines.push(`Destination: ${trip.destination}`);
  if (trip.timeframe) lines.push(`Timeframe: ${trip.timeframe}`);

  const constraintBits = signal.constraints.map((c) => {
    const who = nameFor(c.userId, signal);
    return who ? `${who}: ${c.value}` : c.value;
  });
  const prefBits = signal.preferences
    .filter((p) => p.kind !== "destination")
    .map((p) => {
      const who = nameFor(p.userId, signal);
      return who ? `${who}: ${p.value}` : p.value;
    });

  if (constraintBits.length) lines.push(`Constraints: ${constraintBits.join("; ")}`);
  if (prefBits.length) lines.push(`Preferences: ${prefBits.join("; ")}`);
  if (candidates.length) {
    const top = candidates.slice(0, 2).map((c) => c.label).join(", ");
    lines.push(`Candidate weekends: ${top}`);
  }
  if (signal.openQuestions.length) lines.push(`Still open: ${signal.openQuestions.join(", ")}`);

  // Personalized touches from the Neo4J culture graph (heritage food + origins).
  if (cultureBrief) lines.push(...cultureLines(cultureBrief));

  return lines.join("\n");
}

function nameFor(userId: string | null, signal: TripSignal): string | null {
  if (!userId) return null;
  return signal.participants.find((p) => p.userId === userId)?.displayName ?? null;
}
