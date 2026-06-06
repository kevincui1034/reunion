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

  it("unwraps the live response_answers envelope (answers[0] = JSON string)", () => {
    // The exact shape RocketRide returns from a response_answers node.
    const envelope = {
      answers: ['{"path":"destination-known","destination":"Mexico City","timeframe":"July"}'],
      name: "conversation.txt",
      result_types: { answers: "answers" },
    };
    const s = coerceTripSignal(envelope, { participants: PARTICIPANTS });
    expect(s.destination).toBe("Mexico City");
    expect(s.timeframe).toBe("July");
    expect(s.path).toBe("destination-known");
  });

  it("strips markdown code fences around the JSON answer", () => {
    const envelope = { answers: ["```json\n{\"destination\":\"Tokyo\"}\n```"] };
    const s = coerceTripSignal(envelope, { participants: PARTICIPANTS });
    expect(s.destination).toBe("Tokyo");
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

  it("sends the full extraction instruction (schema + roster), not the bare transcript", async () => {
    // Regression guard: the committed pipeline's `question` node carries no prompt,
    // so the schema + roster MUST travel with the input. Sending only the transcript
    // makes the model emit prose → coercion throws → silent fallback (engine never
    // really runs). Lock the payload shape here.
    let sent = "";
    const { client } = fakeClient({
      send: async (_t: string, data: string) => { sent = data; return { destination: "Mexico City", path: "destination-known" }; },
    });
    const extractor = new RocketRideExtractor({
      clientFactory: () => client,
      pipelinePath: "./pipelines/extract-trip-signal.pipe",
      fallback: extract,
    });

    await extractor.extract(sampleConversation(), displayName);

    expect(sent).toContain('"path"'); // the JSON schema is present
    expect(sent).toContain("=u_"); // roster maps display names → stable userIds
    expect(sent).toContain("never invent"); // the no-hallucination rule
    expect(sent).toMatch(/Conversation:/); // transcript still included
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
    // The real `rocketride` pkg is installed, so connect() to a dead engine would
    // hang. A short degrade timeout makes it fall back fast (mirrors the demo's
    // recoverable-on-failure behavior). 100ms keeps the test snappy.
    const prev = process.env.ROCKETRIDE_TIMEOUT_MS;
    process.env.ROCKETRIDE_TIMEOUT_MS = "100";
    try {
      await expect(doExtract(window, displayName)).resolves.toEqual(extract(window, displayName));
    } finally {
      if (prev === undefined) delete process.env.ROCKETRIDE_TIMEOUT_MS;
      else process.env.ROCKETRIDE_TIMEOUT_MS = prev;
    }
  });
});
