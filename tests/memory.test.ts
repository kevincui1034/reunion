import { describe, it, expect } from "vitest";
import { InMemoryXTrace } from "../src/memory/xtrace.js";

describe("XTrace belief revision", () => {
  it("recalls a written fact", async () => {
    const m = new InMemoryXTrace();
    await m.write({ subjectId: "u_kevin", subjectKind: "user", predicate: "diet", value: "vegetarian", confidence: 0.9, source: "seed", ts: 1 });
    const cur = await m.current("u_kevin", "diet");
    expect(cur).toHaveLength(1);
    expect(cur[0]?.value).toBe("vegetarian");
  });

  it("supersedes a contradicting fact (new wins)", async () => {
    const m = new InMemoryXTrace();
    await m.write({ subjectId: "u_kevin", subjectKind: "user", predicate: "availability", value: "weekends only", confidence: 0.9, source: "m1", ts: 1 });
    await m.write({ subjectId: "u_kevin", subjectKind: "user", predicate: "availability", value: "weekdays ok", confidence: 0.9, source: "m2", ts: 2 });

    const cur = await m.current("u_kevin", "availability");
    expect(cur).toHaveLength(1);
    expect(cur[0]?.value).toBe("weekdays ok");

    const history = await m.history("u_kevin", "availability");
    expect(history).toHaveLength(2);
    expect(history.filter((f) => f.superseded)).toHaveLength(1);
  });

  it("keeps distinct predicates independent", async () => {
    const m = new InMemoryXTrace();
    await m.write({ subjectId: "u_kevin", subjectKind: "user", predicate: "diet", value: "vegetarian", confidence: 0.9, source: "s", ts: 1 });
    await m.write({ subjectId: "u_kevin", subjectKind: "user", predicate: "availability", value: "weekends only", confidence: 0.9, source: "s", ts: 1 });
    expect(await m.current("u_kevin")).toHaveLength(2);
  });
});
