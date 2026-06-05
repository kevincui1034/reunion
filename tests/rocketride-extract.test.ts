import { describe, it, expect } from "vitest";
import {
  coerceTripSignal,
  RocketRideExtractor,
  resolveExtract,
  type RocketRideLike,
} from "../src/pipeline/extractRocketRide.js";
import { extract } from "../src/pipeline/extract.js";
import { displayName, sampleConversation, GROUP_ID } from "../src/mocks/seed.js";
import type { IncomingMessage, TripSignal } from "../src/contracts/index.js";

const PARTICIPANTS = [{ userId: "u_pablo", displayName: "Pablo" }];

describe("coerceTripSignal", () => {
  it("maps a partial pipeline result into a valid TripSignal, defaulting the rest", () => {
    const raw = { path: "destination-known", destination: "Lisbon", confidence: 0.7 };

    const signal = coerceTripSignal(raw, { participants: PARTICIPANTS });

    expect(signal.path).toBe("destination-known");
    expect(signal.destination).toBe("Lisbon");
    expect(signal.timeframe).toBeNull();
    expect(signal.constraints).toEqual([]);
    expect(signal.preferences).toEqual([]);
    expect(signal.openQuestions).toEqual([]);
    expect(signal.confidence).toBe(0.7);
    // participants fall back to the observed window senders (not hallucinated).
    expect(signal.participants).toEqual(PARTICIPANTS);
  });

  it("never invents a destination: missing destination stays null and path opens", () => {
    const signal = coerceTripSignal({ timeframe: "July" }, { participants: PARTICIPANTS });

    expect(signal.destination).toBeNull();
    expect(signal.path).toBe("open-ended");
    expect(signal.timeframe).toBe("July");
  });

  it("accepts a JSON string and a { result } envelope", () => {
    const fromString = coerceTripSignal('{"destination":"Tokyo"}', { participants: PARTICIPANTS });
    expect(fromString.destination).toBe("Tokyo");
    expect(fromString.path).toBe("destination-known");

    const fromEnvelope = coerceTripSignal({ result: { destination: "Tokyo" } }, { participants: PARTICIPANTS });
    expect(fromEnvelope.destination).toBe("Tokyo");
  });

  it("throws on unusable input so the caller can fall back", () => {
    expect(() => coerceTripSignal(null, { participants: PARTICIPANTS })).toThrow();
    expect(() => coerceTripSignal("not json", { participants: PARTICIPANTS })).toThrow();
    expect(() => coerceTripSignal(42, { participants: PARTICIPANTS })).toThrow();
  });
});

describe("RocketRideExtractor", () => {
  function fakeClient(overrides: Partial<RocketRideLike> & { result?: unknown } = {}) {
    const calls: string[] = [];
    const client: RocketRideLike = {
      connect: async () => { calls.push("connect"); },
      use: async () => { calls.push("use"); return { token: "tok_1" }; },
      send: async () => { calls.push("send"); return overrides.result ?? { destination: "Mexico City", path: "destination-known" }; },
      terminate: async () => { calls.push("terminate"); },
      disconnect: async () => { calls.push("disconnect"); },
      ...overrides,
    };
    return { client, calls };
  }

  it("runs the pipeline lifecycle and returns the coerced signal", async () => {
    const { client, calls } = fakeClient();
    const extractor = new RocketRideExtractor({
      clientFactory: () => client,
      pipelinePath: "./pipelines/extract.json",
      fallback: extract,
    });

    const signal = await extractor.extract(sampleConversation(), displayName);

    expect(signal.destination).toBe("Mexico City");
    expect(signal.path).toBe("destination-known");
    expect(calls).toEqual(["connect", "use", "send", "terminate", "disconnect"]);
  });

  it("falls back to the heuristic extractor when the engine errors, and still disconnects", async () => {
    const { client, calls } = fakeClient({
      send: async () => { throw new Error("engine unreachable"); },
    });
    const window = sampleConversation();
    const extractor = new RocketRideExtractor({
      clientFactory: () => client,
      pipelinePath: "./pipelines/extract.json",
      fallback: extract,
    });

    const signal = await extractor.extract(window, displayName);

    // Identical to the heuristic — graceful degradation, no thrown error.
    expect(signal).toEqual(extract(window, displayName));
    expect(calls).toContain("disconnect");
  });

  it("falls back when the pipeline returns an unusable result", async () => {
    const { client } = fakeClient({ result: "garbage-not-json" });
    const window: IncomingMessage[] = sampleConversation();
    const extractor = new RocketRideExtractor({
      clientFactory: () => client,
      pipelinePath: "./pipelines/extract.json",
      fallback: extract,
    });

    const signal: TripSignal = await extractor.extract(window, displayName);
    expect(signal).toEqual(extract(window, displayName));
  });
});

describe("resolveExtract (config selection)", () => {
  it("uses the heuristic when stubs are on", async () => {
    const doExtract = resolveExtract({ useStubs: true }, extract);
    const window = sampleConversation();
    expect(await doExtract(window, displayName)).toEqual(extract(window, displayName));
  });

  it("selects RocketRide when configured, and still degrades to the heuristic if the engine is unreachable", async () => {
    const doExtract = resolveExtract(
      { useStubs: false, rocketride: { uri: "ws://localhost:5565", pipelinePath: "./pipelines/extract.json" } },
      extract,
    );
    const window = sampleConversation();
    // No engine / SDK present in tests → graceful fallback, never throws.
    await expect(doExtract(window, displayName)).resolves.toEqual(extract(window, displayName));
  });
});
