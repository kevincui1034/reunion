import { describe, it, expect } from "vitest";
import { verdictToIntent, verdictToSignalSeed, type GateVerdict } from "../src/gate/adapt.js";
import { assertIntentVerdict } from "../src/contracts/validate.js";

describe("gate seam adapter (Pablo's Verdict → our contracts)", () => {
  it("maps a confident travel verdict to an active wake", () => {
    const v: GateVerdict = { isTravelIntent: true, confidence: 0.9, location: "Mexico City" };
    const intent = verdictToIntent(v, ["m_2"]);
    expect(intent.wake).toBe(true);
    expect(intent.signal).toBe("active");
    expect(() => assertIntentVerdict(intent)).not.toThrow();
  });

  it("maps a low-confidence travel verdict to a weak wake", () => {
    const intent = verdictToIntent({ isTravelIntent: true, confidence: 0.5, location: "" }, ["m_1"]);
    expect(intent.signal).toBe("weak");
  });

  it("maps a non-travel verdict to no wake", () => {
    const intent = verdictToIntent({ isTravelIntent: false, confidence: 0.1, location: "" });
    expect(intent.wake).toBe(false);
    expect(intent.signal).toBe("none");
    expect(() => assertIntentVerdict(intent)).not.toThrow();
  });

  it("seeds destination-known when the gate extracted a location", () => {
    const seed = verdictToSignalSeed({ isTravelIntent: true, confidence: 0.9, location: "Lisbon" });
    expect(seed.path).toBe("destination-known");
    expect(seed.destination).toBe("Lisbon");
  });

  it("seeds open-ended when no location was extracted", () => {
    const seed = verdictToSignalSeed({ isTravelIntent: true, confidence: 0.7, location: "  " });
    expect(seed.path).toBe("open-ended");
    expect(seed.destination).toBeNull();
  });
});
