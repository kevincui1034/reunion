/**
 * CONTRACT TESTS — the integration safety net.
 *
 * For each seam we assert TWO things with the SAME validator:
 *   1. the fixture (the agreement) is valid, and
 *   2. the real producer's output (the implementation) is valid AND agrees with
 *      the fixture's semantics.
 * When a teammate swaps a stub for real code, these tests are the guarantee their
 * output still feeds the next stage correctly.
 */
import { describe, it, expect } from "vitest";
import {
  assertIncomingMessage,
  assertIntentVerdict,
  assertTripSignal,
  assertTrip,
  assertCandidateWeekend,
  assertOutgoingMove,
  assertFact,
} from "../src/contracts/validate.js";
import * as fx from "../src/contracts/fixtures.js";

import { classify } from "../src/gate/heuristic.js";
import { extract } from "../src/pipeline/extract.js";
import { route } from "../src/pipeline/route.js";
import { plan } from "../src/pipeline/plan.js";
import { nextAction } from "../src/pipeline/nextAction.js";
import { computeCandidateWeekends } from "../src/planning/when/availability.js";
import { createClients } from "../src/config.js";
import { GROUP_ID, displayName, mockCalendar, sampleConversation } from "../src/mocks/seed.js";

describe("fixtures honor their contracts", () => {
  it("every seam fixture validates", () => {
    expect(() => assertIncomingMessage(fx.exampleIncomingMessage)).not.toThrow();
    expect(() => assertIntentVerdict(fx.exampleIntentVerdict)).not.toThrow();
    expect(() => assertTripSignal(fx.exampleTripSignal)).not.toThrow();
    expect(() => assertTrip(fx.exampleTrip)).not.toThrow();
    expect(() => assertCandidateWeekend(fx.exampleCandidateWeekend)).not.toThrow();
    expect(() => assertOutgoingMove(fx.exampleOutgoingMove)).not.toThrow();
    expect(() => assertFact(fx.exampleFact)).not.toThrow();
  });
});

describe("producers honor their contracts (Pablo → Jossue → Kevin → Ethan)", () => {
  const window = sampleConversation();

  it("seam 2 — gate produces a valid IntentVerdict", () => {
    const v = classify(window);
    expect(() => assertIntentVerdict(v)).not.toThrow();
  });

  it("seam 3 — extract produces a valid TripSignal matching the fixture's shape", () => {
    const signal = extract(window, displayName);
    expect(() => assertTripSignal(signal)).not.toThrow();
    // Semantic agreement with the fixture (the team's agreed meaning):
    expect(signal.path).toBe(fx.exampleTripSignal.path);
    expect(signal.destination).toBe(fx.exampleTripSignal.destination);
    expect(signal.timeframe).toBe(fx.exampleTripSignal.timeframe);
  });

  it("seam 5 — availability produces valid CandidateWeekends", () => {
    const cands = computeCandidateWeekends(
      { participants: ["u_kevin", "u_ethan", "u_pablo", "u_jossue"], windowKind: "weekend" },
      mockCalendar(),
    );
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) expect(() => assertCandidateWeekend(c)).not.toThrow();
  });

  it("seams 4 + 6 — plan/nextAction produce a valid Trip and OutgoingMove", async () => {
    const clients = createClients();
    const signal = extract(window, displayName);
    const decision = route(signal);
    const result = await plan(signal, decision, GROUP_ID, clients, {
      availability: (q) => computeCandidateWeekends(q, mockCalendar()),
    });
    expect(() => assertTrip(result.trip)).not.toThrow();

    const move = nextAction(result, GROUP_ID);
    expect(() => assertOutgoingMove(move)).not.toThrow();
  });

  it("seam 7 — XTrace stores valid Facts", async () => {
    const clients = createClients();
    const f = await clients.memory.write({
      subjectId: "u_kevin",
      subjectKind: "user",
      predicate: "availability",
      value: "weekends only",
      confidence: 0.9,
      source: "m_3",
      ts: 1,
    });
    expect(() => assertFact(f)).not.toThrow();
  });
});
