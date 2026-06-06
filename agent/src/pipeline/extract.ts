/**
 * RocketRide step: entity extraction → TripSignal.  [Owner: Pablo]
 *
 * STUB: naive regex/keyword extraction so the spine produces a believable
 * TripSignal from the seed conversation. Pablo replaces the body with the real
 * RocketRide extraction step. The CONTRACT (returns TripSignal, never hallucinates
 * missing fields) must hold.
 */
import type {
  IncomingMessage,
  TripSignal,
  ParticipantRef,
  Constraint,
  Preference,
} from "../contracts/index.js";

// Demo-grade gazetteer. Real version: RocketRide extraction over the window.
const KNOWN_DESTINATIONS = ["mexico city", "cdmx", "tokyo", "lisbon", "cancun", "miami"];
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

export function extract(
  window: IncomingMessage[],
  nameOf: (senderId: string) => string,
): TripSignal {
  const participants = new Map<string, ParticipantRef>();
  const constraints: Constraint[] = [];
  const preferences: Preference[] = [];
  let destination: string | null = null;
  let timeframe: string | null = null;

  for (const m of window) {
    const text = m.text.toLowerCase();
    participants.set(m.senderId, { userId: m.senderId, displayName: nameOf(m.senderId) });

    if (!destination) {
      const hit = KNOWN_DESTINATIONS.find((d) => text.includes(d));
      if (hit) destination = hit === "cdmx" ? "Mexico City" : titleCase(hit);
    }
    if (!timeframe) {
      const month = MONTHS.find((mo) => text.includes(mo));
      if (month) timeframe = titleCase(month);
    }
    if (/weekend|only do weekends|can only do/.test(text)) {
      constraints.push({ userId: m.senderId, kind: "availability", value: "weekends only" });
    }
    if (/vegetarian|vegan|no meat/.test(text)) {
      preferences.push({ userId: m.senderId, kind: "food", value: "vegetarian" });
    }
    if (/roma norte|condesa|polanco/.test(text)) {
      const nb = text.match(/roma norte|condesa|polanco/)![0];
      preferences.push({ userId: m.senderId, kind: "lodging", value: titleCase(nb) });
    }
  }

  const openQuestions: string[] = [];
  if (!timeframe) openQuestions.push("exact dates");
  if (constraints.length === 0) openQuestions.push("availability");

  return {
    path: destination ? "destination-known" : "open-ended",
    destination,
    timeframe,
    participants: [...participants.values()],
    constraints,
    preferences,
    openQuestions,
    confidence: destination ? 0.8 : 0.4,
  };
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
