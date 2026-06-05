import { describe, it, expect } from "vitest";
import { createClients } from "../src/config.js";
import { extract } from "../src/pipeline/extract.js";
import { route } from "../src/pipeline/route.js";
import { plan } from "../src/pipeline/plan.js";
import type { AvailabilityResolver } from "../src/planning/when/availabilityResolver.js";
import type { CandidateWeekend } from "../src/contracts/index.js";
import { GROUP_ID, displayName, sampleConversation } from "../src/mocks/seed.js";

const DAY = 24 * 60 * 60 * 1000;

const aWindow: CandidateWeekend = {
  start: Date.UTC(2026, 6, 14),
  end: Date.UTC(2026, 6, 17),
  availableUserIds: ["+1", "+2"],
  conflictUserIds: [],
  score: 1,
  label: "Jul 14–16",
};

function setup() {
  const clients = createClients();
  const signal = extract(sampleConversation(), displayName);
  const decision = route(signal);
  return { clients, signal, decision };
}

describe("plan — itinerary flow", () => {
  it("auto-picks a window, generates an itinerary, and marks the trip planned", async () => {
    const { clients, signal, decision } = setup();
    const availability: AvailabilityResolver = async () => ({
      candidates: [aWindow],
      pendingConnects: [],
    });

    const result = await plan(signal, decision, GROUP_ID, clients, { availability });

    expect(result.nextStep).toBe("itinerary");
    expect(result.chosenWindow).toEqual(aWindow);
    expect(result.itinerary).toContain("Trip plan");
    expect(result.trip.status).toBe("planned");
    // The itinerary becomes the trip's current_summary (system of record).
    expect(result.trip.currentSummary).toBe(result.itinerary);

    // XTrace records the chosen plan so future trips inherit context.
    const planned = await clients.memory.current(GROUP_ID, "plannedTrip");
    expect(planned[0]?.value).toContain("Jul 14–16");
  });

  it("uses an injected itinerary generator when provided", async () => {
    const { clients, signal, decision } = setup();
    const availability: AvailabilityResolver = async () => ({ candidates: [aWindow], pendingConnects: [] });
    const result = await plan(signal, decision, GROUP_ID, clients, {
      availability,
      generateItinerary: async (input) => `CUSTOM ${input.destination} ${input.window.label}`,
    });
    expect(result.itinerary).toBe("CUSTOM Mexico City Jul 14–16");
  });

  it("proceeds with resolved participants — no window yet surfaces pending connect links", async () => {
    const { clients, signal, decision } = setup();
    const availability: AvailabilityResolver = async () => ({
      candidates: [],
      pendingConnects: [{ handle: "+1555000002", connectUrl: "https://connect/2" }],
    });

    const result = await plan(signal, decision, GROUP_ID, clients, { availability });

    expect(result.nextStep).toBe("gather-availability");
    expect(result.itinerary).toBeUndefined();
    expect(result.trip.status).toBe("scheduling");
    expect(result.pendingConnects).toEqual([{ handle: "+1555000002", connectUrl: "https://connect/2" }]);
    // current_summary holds the recap, not an itinerary.
    expect(result.trip.currentSummary).toContain("Mexico City");
  });

  it("passes the trip (with id) to the availability resolver", async () => {
    const { clients, signal, decision } = setup();
    let seenTripId = "";
    const availability: AvailabilityResolver = async (trip) => {
      seenTripId = trip.id;
      return { candidates: [aWindow], pendingConnects: [] };
    };
    const result = await plan(signal, decision, GROUP_ID, clients, { availability });
    expect(seenTripId).toBe(result.trip.id);
    expect(seenTripId).toMatch(/^trip_/);
  });
});

describe("plan — window label sanity", () => {
  it("a 3-day window spans exactly 3 days", () => {
    expect(aWindow.end - aWindow.start).toBe(3 * DAY);
  });
});
