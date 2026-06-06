import { describe, it, expect } from "vitest";
import { createClients } from "../src/config.js";
import { extract } from "../src/pipeline/extract.js";
import { route } from "../src/pipeline/route.js";
import { plan } from "../src/pipeline/plan.js";
import { nextAction } from "../src/pipeline/nextAction.js";
import { computeCandidateWeekends } from "../src/planning/when/availability.js";
import type { AvailabilityResolver } from "../src/planning/when/availabilityResolver.js";
import {
  GROUP_ID,
  displayName,
  mockCalendar,
  sampleConversation,
} from "../src/mocks/seed.js";

describe("end-to-end spine (destination-known)", () => {
  it("turns the seed conversation into a planned trip + itinerary move", async () => {
    const clients = createClients();
    const calendar = mockCalendar();
    const window = sampleConversation();

    const signal = extract(window, displayName);
    expect(signal.path).toBe("destination-known");
    expect(signal.destination).toBe("Mexico City");
    expect(signal.timeframe).toBe("July");

    const decision = route(signal);
    expect(decision.act).toBe(true);

    const availability: AvailabilityResolver = async (_trip, ids) => ({
      candidates: computeCandidateWeekends({ participants: ids, windowKind: "weekend" }, calendar),
      pendingConnects: [],
    });
    const result = await plan(signal, decision, GROUP_ID, clients, { availability });
    expect(result.trip.destination).toBe("Mexico City");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.nextStep).toBe("itinerary");
    expect(result.chosenWindow).toBeDefined();
    expect(result.itinerary).toContain("Mexico City");
    expect(result.trip.status).toBe("planned");

    // The move is the rendered itinerary, plain text (no poll in Local mode).
    const move = nextAction(result, GROUP_ID);
    expect(move.poll).toBeUndefined();
    expect(move.text).toContain("Trip plan");
    expect(move.text).toContain("Mexico City");

    // Trip is persisted state, retrievable from Butterbase by id (the system of record).
    const persisted = await clients.state.getTrip(result.trip.id);
    expect(persisted?.id).toBe(result.trip.id);
    expect(persisted?.currentSummary).toBe(result.itinerary);
  });

  it("does not act on a non-destination signal", () => {
    const signal = extract(
      [{ channel: "iMessage" as const, groupId: GROUP_ID, senderId: "u_kevin", text: "we should travel somewhere", ts: 0, messageId: "m1" }],
      displayName,
    );
    const decision = route(signal);
    expect(decision.act).toBe(false);
  });
});
