import { describe, it, expect } from "vitest";
import {
  renderItineraryTemplate,
  coerceItineraryText,
  buildItineraryPrompt,
  RocketRideItinerary,
  resolveItinerary,
  type ItineraryInput,
} from "../src/planning/what/itinerary.js";
import type { RocketRideLike } from "../src/pipeline/extractRocketRide.js";
import type { CandidateWeekend } from "../src/contracts/index.js";

const DAY = 24 * 60 * 60 * 1000;

function window(days: number): CandidateWeekend {
  const start = Date.UTC(2026, 6, 14);
  return {
    start,
    end: start + days * DAY,
    availableUserIds: ["+1", "+2"],
    conflictUserIds: [],
    score: 1,
    label: "Jul 14–16",
  };
}

const input = (over: Partial<ItineraryInput> = {}): ItineraryInput => ({
  destination: "Lisbon",
  window: window(3),
  facts: { diets: [], budget: null, cultureNote: null },
  ...over,
});

describe("renderItineraryTemplate", () => {
  it("renders one block per day with a header and the destination", () => {
    const text = renderItineraryTemplate(input());
    expect(text).toContain("Trip plan — Lisbon, Jul 14–16");
    expect(text).toContain("Day 1");
    expect(text).toContain("Day 3");
    expect(text).not.toContain("Day 4");
    expect(text.endsWith("Reply 👍 if this works.")).toBe(true);
  });

  it("includes diet and budget notes when known", () => {
    const text = renderItineraryTemplate(
      input({ facts: { diets: ["vegetarian"], budget: "mid-range", cultureNote: "Food picks: a pupusería." } }),
    );
    expect(text).toContain("vegetarian-friendly");
    expect(text).toContain("Budget: mid-range");
    expect(text).toContain("Food picks: a pupusería.");
  });

  it("is plain text — no Markdown formatting", () => {
    const text = renderItineraryTemplate(input());
    expect(text).not.toMatch(/[*#`]/);
  });
});

describe("buildItineraryPrompt", () => {
  it("states the day count, destination, and plain-text rule", () => {
    const p = buildItineraryPrompt(input({ window: window(2) }));
    expect(p).toContain("2-day itinerary");
    expect(p).toContain("Lisbon");
    expect(p).toMatch(/Plain text ONLY/i);
  });
});

describe("coerceItineraryText", () => {
  it("returns a plain string", () => {
    expect(coerceItineraryText("Trip plan — X")).toBe("Trip plan — X");
  });

  it("unwraps the response_answers envelope", () => {
    expect(coerceItineraryText({ answers: ["Day 1\n- arrive"] })).toBe("Day 1\n- arrive");
  });

  it("strips a markdown code fence", () => {
    expect(coerceItineraryText({ answers: ["```\nDay 1\n```"] })).toBe("Day 1");
  });

  it("throws on an empty result so the caller can fall back", () => {
    expect(() => coerceItineraryText({ answers: [""] })).toThrow();
    expect(() => coerceItineraryText(null)).toThrow();
  });
});

describe("RocketRideItinerary", () => {
  function fakeClient(over: Partial<RocketRideLike> & { result?: unknown } = {}) {
    const calls: string[] = [];
    const client: RocketRideLike = {
      connect: async () => { calls.push("connect"); },
      use: async () => { calls.push("use"); return { token: "t" }; },
      send: async () => { calls.push("send"); return over.result ?? { answers: ["Trip plan — Lisbon, Jul 14–16\nDay 1\n- arrive"] }; },
      terminate: async () => { calls.push("terminate"); },
      disconnect: async () => { calls.push("disconnect"); },
      ...over,
    };
    return { client, calls };
  }

  it("runs the lifecycle and returns the generated itinerary", async () => {
    const { client, calls } = fakeClient();
    const gen = new RocketRideItinerary({ clientFactory: () => client, pipelinePath: "p" });
    const text = await gen.generate(input());
    expect(text).toContain("Trip plan — Lisbon");
    expect(calls).toEqual(["connect", "use", "send", "terminate", "disconnect"]);
  });

  it("falls back to the template on engine error, and still disconnects", async () => {
    const { client, calls } = fakeClient({ send: async () => { throw new Error("down"); } });
    const gen = new RocketRideItinerary({ clientFactory: () => client, pipelinePath: "p" });
    const text = await gen.generate(input());
    expect(text).toBe(renderItineraryTemplate(input()));
    expect(calls).toContain("disconnect");
  });

  it("falls back when the result is empty", async () => {
    const { client } = fakeClient({ result: { answers: [""] } });
    const gen = new RocketRideItinerary({ clientFactory: () => client, pipelinePath: "p" });
    expect(await gen.generate(input())).toBe(renderItineraryTemplate(input()));
  });
});

describe("resolveItinerary", () => {
  it("uses the template when stubs are on", async () => {
    const gen = resolveItinerary({ useStubs: true });
    expect(await gen(input())).toBe(renderItineraryTemplate(input()));
  });
});
