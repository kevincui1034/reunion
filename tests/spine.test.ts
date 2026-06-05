import { describe, it, expect } from "vitest";
import { createClients } from "../src/config.js";
import { extract } from "../src/pipeline/extract.js";
import { route } from "../src/pipeline/route.js";
import { plan } from "../src/pipeline/plan.js";
import { nextAction } from "../src/pipeline/nextAction.js";
import { computeCandidateWeekends } from "../src/planning/when/availability.js";
import {
  GROUP_ID,
  displayName,
  mockCalendar,
  sampleConversation,
} from "../src/mocks/seed.js";

describe("end-to-end spine (destination-known)", () => {
  it("turns the seed conversation into a trip + date-poll move", async () => {
    const clients = createClients();
    const calendar = mockCalendar();
    const window = sampleConversation();

    const signal = extract(window, displayName);
    expect(signal.path).toBe("destination-known");
    expect(signal.destination).toBe("Mexico City");
    expect(signal.timeframe).toBe("July");

    const decision = route(signal);
    expect(decision.act).toBe(true);

    const result = await plan(signal, decision, GROUP_ID, clients, {
      availability: (q) => computeCandidateWeekends(q, calendar),
    });
    expect(result.trip.destination).toBe("Mexico City");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.summary).toContain("Mexico City");

    const move = nextAction(result, GROUP_ID);
    expect(move.poll).toBeDefined();
    expect(move.poll!.choices.length).toBeGreaterThan(0);

    // Trip is persisted state, retrievable from Butterbase (the system of record).
    const persisted = await clients.state.findTripByGroup(GROUP_ID);
    expect(persisted?.id).toBe(result.trip.id);
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
