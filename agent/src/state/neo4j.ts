/**
 * Neo4J culture graph — the group's heritage/cuisine/origin knowledge graph.  [Jossue]
 *
 * `CultureGraph` is the seam: `facts(userIds)` returns raw graph facts that the pure
 * `buildGroupBrief` turns into the recall+decide brief. `InMemoryCultureGraph` is a
 * working stub over the canonical seed data; `Neo4jCultureGraph` reads the same shape
 * from a live Aura instance via `neo4j-driver`. Swap via config (USE_STUBS + creds).
 */
import type { CultureFacts, CityFacts, PersonBrief } from "../contracts/index.js";
import { CULTURE_FACTS } from "../mocks/culture.js";

export interface CultureGraph {
  /** People facts for the requested users + all candidate destination cities. */
  facts(userIds: string[]): Promise<CultureFacts>;
  /** Release driver resources (no-op for the stub). */
  close(): Promise<void>;
}

export class InMemoryCultureGraph implements CultureGraph {
  constructor(private readonly data: CultureFacts = CULTURE_FACTS) {}

  async facts(userIds: string[]): Promise<CultureFacts> {
    const people = userIds
      .map((id) => this.data.people.find((p) => p.userId === id))
      .filter((p): p is PersonBrief => Boolean(p));
    return { people, cities: this.data.cities };
  }

  async close(): Promise<void> {
    /* nothing to release */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Neo4J implementation
// ─────────────────────────────────────────────────────────────────────────────

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
}

const PEOPLE_CYPHER = `
MATCH (p:Person) WHERE p.id IN $userIds
OPTIONAL MATCH (p)-[:HERITAGE]->(h:Heritage)
OPTIONAL MATCH (h)-[:SIGNATURE]->(cu:Cuisine)
OPTIONAL MATCH (p)-[:DIET]->(d:Diet)
OPTIONAL MATCH (p)-[:LIVES_IN]->(home:City)-[:HAS_AIRPORT]->(a:Airport)
RETURN p.id AS userId, p.name AS displayName, h.name AS heritage,
       cu.name AS cuisine, d.name AS diet, home.name AS homeCity, a.code AS originAirport`;

const CITIES_CYPHER = `
MATCH (c:City)-[o:OFFERS]->(cu:Cuisine)
RETURN c.name AS city, c.airport AS airport, c.localTransit AS localTransit,
       collect({ cuisine: cu.name, spot: o.spot }) AS offers`;

export class Neo4jCultureGraph implements CultureGraph {
  // `any` to avoid a hard type dependency on neo4j-driver at the seam boundary.
  private driver: any;

  private constructor(driver: any) {
    this.driver = driver;
  }

  /** neo4j-driver is an optional dep; load it lazily so the stub path never needs it. */
  static async connect(cfg: Neo4jConfig): Promise<Neo4jCultureGraph> {
    const neo4j: any = await import("neo4j-driver");
    const driver = (neo4j.default ?? neo4j).driver(
      cfg.uri,
      (neo4j.default ?? neo4j).auth.basic(cfg.user, cfg.password),
    );
    return new Neo4jCultureGraph(driver);
  }

  async facts(userIds: string[]): Promise<CultureFacts> {
    const session = this.driver.session();
    try {
      const peopleRes = await session.run(PEOPLE_CYPHER, { userIds });
      const people: PersonBrief[] = peopleRes.records.map((r: any) => ({
        userId: r.get("userId"),
        displayName: r.get("displayName"),
        heritage: r.get("heritage"),
        cuisine: r.get("cuisine"),
        diet: r.get("diet") ?? null,
        homeCity: r.get("homeCity"),
        originAirport: r.get("originAirport"),
      }));
      // Preserve the requested order (Cypher doesn't guarantee IN-list order).
      people.sort((a, b) => userIds.indexOf(a.userId) - userIds.indexOf(b.userId));

      const citiesRes = await session.run(CITIES_CYPHER);
      const cities: CityFacts[] = citiesRes.records.map((r: any) => ({
        name: r.get("city"),
        airport: r.get("airport") ?? undefined,
        localTransit: r.get("localTransit") ?? undefined,
        offers: r.get("offers"),
      }));
      return { people, cities };
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

/**
 * Pick the culture graph from config: live Aura when configured + USE_STUBS=false,
 * else the in-memory stub. If the live connection fails, degrade to the stub so the
 * demo never breaks (same graceful-degradation contract as the rest of the spine).
 */
export async function resolveCultureGraph(cfg: {
  useStubs: boolean;
  neo4j?: Neo4jConfig;
}): Promise<CultureGraph> {
  if (!cfg.useStubs && cfg.neo4j) {
    try {
      return await Neo4jCultureGraph.connect(cfg.neo4j);
    } catch {
      return new InMemoryCultureGraph();
    }
  }
  return new InMemoryCultureGraph();
}
