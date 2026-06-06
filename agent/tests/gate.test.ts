import { describe, it, expect } from "vitest";
import { classify } from "../src/gate/heuristic.js";
import type { IncomingMessage } from "../src/contracts/index.js";

function msg(text: string, id = "m1"): IncomingMessage {
  return { channel: "iMessage", groupId: "g", senderId: "u", text, ts: 0, messageId: id };
}

describe("intent gate (heuristic v0)", () => {
  it("does not wake on casual chatter", () => {
    const v = classify([msg("lol did you see that meme")]);
    expect(v.wake).toBe(false);
    expect(v.signal).toBe("none");
  });

  it("wakes on an active travel signal", () => {
    const v = classify([msg("We should go to Mexico City in July")]);
    expect(v.wake).toBe(true);
    expect(v.signal).toBe("active");
    expect(v.triggeringMessageIds).toContain("m1");
  });

  it("wakes on an explicit command", () => {
    const v = classify([msg("plan this", "c1")]);
    expect(v.wake).toBe(true);
    expect(v.signal).toBe("command");
  });

  it("explains why it woke", () => {
    const v = classify([msg("let's plan a trip")]);
    expect(v.reason).toBeTruthy();
  });
});
