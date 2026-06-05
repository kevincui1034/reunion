/**
 * Culture-aware planning — recall + decide over the Neo4J knowledge graph.  [Jossue]
 *
 * `buildGroupBrief` is the pure core: given raw graph facts (people + cities) and a
 * destination, it RECALLS each person's heritage/cuisine/diet/origin and DECIDES
 * either the per-person food picks at a known destination, or a ranking of candidate
 * cities by how well they cover the whole group's cuisines.
 *
 * Pure and deterministic so the demo's "beautiful" output is stable and unit-tested,
 * independent of whether the facts came from live Neo4J or the in-memory stub.
 */
import type {
  CultureFacts,
  GroupBrief,
  DestinationFit,
  FoodPick,
  PersonBrief,
} from "../../contracts/index.js";

/**
 * Render the brief into terse, chat-sized recap lines (PRD §18) — the "beautiful"
 * personalization the agent posts: per-person heritage food picks, an honest gap
 * note when the destination misses a cuisine, and the origins/travel line.
 */
export function cultureLines(brief: GroupBrief): string[] {
  const lines: string[] = [];
  const fit = brief.destinationFit;

  if (fit) {
    const hits = fit.picks.filter((p) => p.spot !== null);
    if (hits.length) {
      lines.push(`Food: ${hits.map((p) => `${p.displayName} → ${p.spot}`).join(" · ")}`);
    }
    const misses = fit.picks.filter((p) => p.spot === null);
    if (misses.length) {
      lines.push(`Heads up: no ${misses.map((p) => `${p.cuisine} for ${p.displayName}`).join(", ")} in ${fit.city}`);
    }
  } else if (brief.rankedDestinations.length) {
    const top = brief.rankedDestinations
      .slice(0, 2)
      .map((d) => `${d.city} (${Math.round(d.coverage * 100)}%)`)
      .join(", ");
    lines.push(`Best fits for the group's tastes: ${top}`);
  }

  if (brief.origins.length) {
    if (fit?.airport) {
      // Round-trip: every origin paired with the destination airport (there + back).
      lines.push(
        `Round-trip: ${brief.origins.map((o) => `${o.displayName} ${o.airport}⇄${fit.airport}`).join(" · ")}`,
      );
    } else {
      // Open-ended / no destination airport yet — one-way origins only.
      lines.push(`Flying in: ${brief.origins.map((o) => `${o.displayName} (${o.airport})`).join(", ")}`);
    }
  }

  // Within-destination transit — only when the city has a note ("if required").
  if (fit?.localTransit && fit.airport) {
    lines.push(`Getting around ${fit.airport}: ${fit.localTransit}`);
  }
  return lines;
}

export function buildGroupBrief(
  facts: CultureFacts,
  userIds: string[],
  destination: string | null,
): GroupBrief {
  // RECALL — people facts, in the requested order, scoped to the participants.
  const people: PersonBrief[] = userIds
    .map((id) => facts.people.find((p) => p.userId === id))
    .filter((p): p is PersonBrief => Boolean(p));

  const origins = people.map((p) => ({
    userId: p.userId,
    displayName: p.displayName,
    homeCity: p.homeCity,
    airport: p.originAirport,
  }));

  // DECIDE
  if (destination) {
    return { people, origins, destinationFit: fitFor(facts, people, destination), rankedDestinations: [] };
  }
  const rankedDestinations = facts.cities
    .map((c) => fitFor(facts, people, c.name))
    .sort((a, b) => b.coverage - a.coverage);
  return { people, origins, destinationFit: null, rankedDestinations };
}

/** Score a single city against the group and collect per-person picks. */
function fitFor(facts: CultureFacts, people: PersonBrief[], city: string): DestinationFit {
  const match = facts.cities.find((c) => c.name.toLowerCase() === city.toLowerCase());
  const cityName = match?.name ?? city; // preserve canonical casing when known
  const offers = match?.offers ?? [];

  const picks: FoodPick[] = people.map((p) => {
    const offer = offers.find((o) => o.cuisine.toLowerCase() === p.cuisine.toLowerCase());
    return {
      userId: p.userId,
      displayName: p.displayName,
      cuisine: p.cuisine,
      spot: offer?.spot ?? null,
    };
  });

  const groupCuisines = new Set(people.map((p) => p.cuisine.toLowerCase()));
  const coveredCuisines = new Set(
    picks.filter((p) => p.spot !== null).map((p) => p.cuisine.toLowerCase()),
  );
  const coverage = groupCuisines.size ? coveredCuisines.size / groupCuisines.size : 0;

  return {
    city: cityName,
    airport: match?.airport ?? null,
    localTransit: match?.localTransit ?? null,
    coverage,
    picks,
  };
}
