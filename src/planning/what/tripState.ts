/**
 * Trip state — the "what".  [Owner: Jossue]
 *
 * Creates/updates the Butterbase Trip (system of record) from a TripSignal, and
 * mirrors durable preferences/constraints into XTrace (beliefs). This is the seam
 * where extraction becomes persisted, queryable state.
 */
import type { Clients } from "../../config.js";
import type { Trip, TripSignal } from "../../contracts/index.js";

export async function upsertTripFromSignal(
  signal: TripSignal,
  groupId: string,
  clients: Clients,
): Promise<Trip> {
  if (!signal.destination) {
    throw new Error("upsertTripFromSignal requires a known destination");
  }

  const existing = await clients.state.findTripByGroup(groupId);
  const trip = existing
    ? await clients.state.updateTrip(existing.id, {
        destination: signal.destination,
        timeframe: signal.timeframe ?? existing.timeframe,
      })
    : await clients.state.createTrip({
        groupId,
        destination: signal.destination,
        timeframe: signal.timeframe,
        status: "forming",
        currentSummary: "",
      });

  // Persist participants as Butterbase rows.
  for (const p of signal.participants) {
    const diet = signal.preferences
      .filter((pref) => pref.userId === p.userId && pref.kind === "food")
      .map((pref) => pref.value);
    const avail = signal.constraints.find(
      (c) => c.userId === p.userId && c.kind === "availability",
    )?.value;
    await clients.state.upsertParticipant({
      tripId: trip.id,
      userId: p.userId,
      availability: avail,
      dietaryPreferences: diet.length ? diet : undefined,
    });
  }

  // Mirror durable facts into XTrace (belief revision handles contradictions).
  const now = Date.now();
  for (const c of signal.constraints) {
    if (!c.userId) continue;
    await clients.memory.write({
      subjectId: c.userId,
      subjectKind: "user",
      predicate: c.kind,
      value: c.value,
      confidence: 0.9,
      source: "pipeline-extract",
      ts: now,
    });
  }
  for (const pref of signal.preferences) {
    if (!pref.userId) continue;
    await clients.memory.write({
      subjectId: pref.userId,
      subjectKind: "user",
      predicate: pref.kind,
      value: pref.value,
      confidence: 0.8,
      source: "pipeline-extract",
      ts: now,
    });
  }
  // Group-level destination interest.
  await clients.memory.write({
    subjectId: groupId,
    subjectKind: "group",
    predicate: "destinationInterest",
    value: signal.destination,
    confidence: 0.85,
    source: "pipeline-extract",
    ts: now,
  });

  return trip;
}
