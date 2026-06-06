import { describe, it, expect } from "vitest";
import { buildGroupBrief, cultureLines } from "../src/planning/what/culture.js";
import { InMemoryCultureGraph } from "../src/state/neo4j.js";
import type { CultureFacts } from "../src/contracts/index.js";

const FACTS: CultureFacts = {
  people: [
    { userId: "u_jossue", displayName: "Jossue", heritage: "Salvadoran", cuisine: "Pupusas", diet: null, homeCity: "Newark", originAirport: "EWR" },
    { userId: "u_pablo", displayName: "Pablo", heritage: "Mexican", cuisine: "Tacos al pastor", diet: null, homeCity: "Los Angeles", originAirport: "LAX" },
    { userId: "u_kevin", displayName: "Kevin", heritage: "Chinese", cuisine: "Dim sum", diet: null, homeCity: "San Francisco", originAirport: "SFO" },
    { userId: "u_ethan", displayName: "Ethan", heritage: "Texan", cuisine: "Tex-Mex", diet: "vegetarian", homeCity: "Austin", originAirport: "AUS" },
  ],
  cities: [
    { name: "Mexico City", airport: "MEX", localTransit: "Metro + walkable Roma/Condesa", offers: [
      { cuisine: "Pupusas", spot: "a Roma Norte pupusería" },
      { cuisine: "Tacos al pastor", spot: "tacos al pastor downtown" },
      { cuisine: "Dim sum", spot: "dim sum in Barrio Chino" },
      { cuisine: "Tex-Mex", spot: "veggie Tex-Mex in Condesa" },
    ] },
    // Austin has an airport but NO localTransit — getting-around line must be omitted.
    { name: "Austin", airport: "AUS", offers: [
      { cuisine: "Tacos al pastor", spot: "East Austin taqueria" },
      { cuisine: "Tex-Mex", spot: "veggie Tex-Mex on Rainey" },
    ] },
  ],
};

const ALL = ["u_jossue", "u_pablo", "u_kevin", "u_ethan"];

describe("buildGroupBrief — recall", () => {
  it("recalls each person's heritage + origin, scoped to the requested users", () => {
    const brief = buildGroupBrief(FACTS, ALL, null);
    expect(brief.people.map((p) => p.displayName)).toEqual(["Jossue", "Pablo", "Kevin", "Ethan"]);
    const jossue = brief.people.find((p) => p.userId === "u_jossue")!;
    expect(jossue.heritage).toBe("Salvadoran");
    expect(jossue.originAirport).toBe("EWR");
    // origins are derived for the travel line
    expect(brief.origins).toContainEqual({ userId: "u_jossue", displayName: "Jossue", homeCity: "Newark", airport: "EWR" });
    expect(brief.origins).toHaveLength(4);
  });

  it("only includes the requested participants", () => {
    const brief = buildGroupBrief(FACTS, ["u_kevin", "u_ethan"], null);
    expect(brief.people.map((p) => p.userId)).toEqual(["u_kevin", "u_ethan"]);
    expect(brief.origins).toHaveLength(2);
  });
});

describe("buildGroupBrief — decide (destination known)", () => {
  it("full-coverage city gives every person a real spot", () => {
    const brief = buildGroupBrief(FACTS, ALL, "Mexico City");
    expect(brief.destinationFit).not.toBeNull();
    expect(brief.destinationFit!.coverage).toBe(1);
    expect(brief.destinationFit!.picks).toHaveLength(4);
    const ethan = brief.destinationFit!.picks.find((p) => p.userId === "u_ethan")!;
    expect(ethan.spot).toBe("veggie Tex-Mex in Condesa");
    expect(brief.destinationFit!.picks.every((p) => p.spot !== null)).toBe(true);
  });

  it("partial-coverage city scores < 1 and leaves unmatched people with a null spot", () => {
    const brief = buildGroupBrief(FACTS, ALL, "Austin");
    expect(brief.destinationFit!.coverage).toBe(0.5); // tacos + tex-mex of 4 cuisines
    const jossue = brief.destinationFit!.picks.find((p) => p.userId === "u_jossue")!;
    expect(jossue.spot).toBeNull(); // no pupusas in the fixture's Austin
    const pablo = brief.destinationFit!.picks.find((p) => p.userId === "u_pablo")!;
    expect(pablo.spot).toBe("East Austin taqueria");
  });

  it("matches the destination case-insensitively", () => {
    const brief = buildGroupBrief(FACTS, ALL, "mexico city");
    expect(brief.destinationFit!.city).toBe("Mexico City");
    expect(brief.destinationFit!.coverage).toBe(1);
  });

  it("carries the destination airport + getting-around note", () => {
    const fit = buildGroupBrief(FACTS, ALL, "Mexico City").destinationFit!;
    expect(fit.airport).toBe("MEX");
    expect(fit.localTransit).toBe("Metro + walkable Roma/Condesa");
  });

  it("unknown destination still returns a fit (coverage 0, all picks null) — honest, not a crash", () => {
    const brief = buildGroupBrief(FACTS, ALL, "Reykjavik");
    expect(brief.destinationFit!.city).toBe("Reykjavik");
    expect(brief.destinationFit!.coverage).toBe(0);
    expect(brief.destinationFit!.picks.every((p) => p.spot === null)).toBe(true);
  });
});

describe("buildGroupBrief — decide (open-ended)", () => {
  it("ranks candidate cities best-coverage first when no destination is set", () => {
    const brief = buildGroupBrief(FACTS, ALL, null);
    expect(brief.destinationFit).toBeNull();
    expect(brief.rankedDestinations.map((d) => d.city)).toEqual(["Mexico City", "Austin"]);
    expect(brief.rankedDestinations[0]!.coverage).toBe(1);
  });
});

describe("cultureLines (rendered recap)", () => {
  it("renders per-person food picks + a ROUND-TRIP travel line for a known destination", () => {
    const lines = cultureLines(buildGroupBrief(FACTS, ALL, "Mexico City"));
    const text = lines.join("\n");
    expect(text).toContain("Roma Norte"); // Jossue's pupusería
    expect(text).toContain("Ethan"); // veggie Tex-Mex pick present
    // round-trip: each origin paired with the destination airport (outbound + back)
    expect(text).toMatch(/Round-trip:/);
    expect(text).toContain("EWR⇄MEX");
    expect(text).toContain("AUS⇄MEX");
  });

  it("adds a getting-around line only when the destination has one", () => {
    const withTransit = cultureLines(buildGroupBrief(FACTS, ALL, "Mexico City")).join("\n");
    expect(withTransit).toContain("Getting around MEX: Metro + walkable Roma/Condesa");

    const noTransit = cultureLines(buildGroupBrief(FACTS, ALL, "Austin")).join("\n");
    expect(noTransit).not.toMatch(/Getting around/); // Austin fixture has no transit note
  });

  it("flags an honest gap when the destination misses someone's cuisine", () => {
    const lines = cultureLines(buildGroupBrief(FACTS, ALL, "Austin")).join("\n");
    // Jossue (pupusas) + Kevin (dim sum) aren't covered by the Austin fixture
    expect(lines.toLowerCase()).toContain("no ");
  });

  it("suggests best-fit cities when the trip is still open-ended", () => {
    const lines = cultureLines(buildGroupBrief(FACTS, ALL, null)).join("\n");
    expect(lines).toContain("Mexico City");
  });
});

describe("InMemoryCultureGraph (real seed data)", () => {
  it("returns facts for the requested users + all candidate cities", async () => {
    const facts = await new InMemoryCultureGraph().facts(ALL);
    expect(facts.people).toHaveLength(4);
    expect(facts.cities.length).toBeGreaterThanOrEqual(2);
  });

  it("the demo destination (Mexico City) covers the whole group", async () => {
    const graph = new InMemoryCultureGraph();
    const facts = await graph.facts(ALL);
    const brief = buildGroupBrief(facts, ALL, "Mexico City");
    expect(brief.destinationFit!.coverage).toBe(1);
    // every friend gets a real, heritage-matched spot
    expect(brief.destinationFit!.picks.every((p) => p.spot !== null)).toBe(true);
    // origins span four different cities — real "friends in different cities"
    expect(new Set(brief.origins.map((o) => o.airport)).size).toBe(4);
  });
});
