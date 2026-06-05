/**
 * Seed the Neo4J (Aura) culture graph from the canonical CULTURE_FACTS, then read
 * it back through the real client and print the personalized brief — proving the
 * whole chain end-to-end (graph → facts → buildGroupBrief → beautiful recap).
 *
 * Run:  npm run graph:seed   (loads .env for ROCKETRIDE_NEO4J_*)
 * Idempotent (MERGE) — safe to re-run.
 */
import neo4j from "neo4j-driver";
import { CULTURE_FACTS } from "../src/mocks/culture.js";
import { Neo4jCultureGraph } from "../src/state/neo4j.js";
import { buildGroupBrief, cultureLines } from "../src/planning/what/culture.js";

const uri = process.env.ROCKETRIDE_NEO4J_URI ?? "";
const user = process.env.ROCKETRIDE_NEO4J_USER ?? "neo4j";
const password = process.env.ROCKETRIDE_NEO4J_PASSWORD ?? "";

async function seed() {
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = driver.session();
  try {
    for (const p of CULTURE_FACTS.people) {
      await session.run(
        `MERGE (p:Person {id:$userId}) SET p.name=$displayName
         MERGE (h:Heritage {name:$heritage}) MERGE (p)-[:HERITAGE]->(h)
         MERGE (cu:Cuisine {name:$cuisine}) MERGE (h)-[:SIGNATURE]->(cu)
         MERGE (home:City {name:$homeCity}) MERGE (p)-[:LIVES_IN]->(home)
         MERGE (a:Airport {code:$originAirport}) MERGE (home)-[:HAS_AIRPORT]->(a)`,
        p,
      );
      if (p.diet) {
        await session.run(
          `MATCH (p:Person {id:$userId}) MERGE (d:Diet {name:$diet}) MERGE (p)-[:DIET]->(d)`,
          p,
        );
      }
    }
    for (const c of CULTURE_FACTS.cities) {
      await session.run(
        `MERGE (c:City {name:$name}) SET c.airport=$airport, c.localTransit=$localTransit`,
        { name: c.name, airport: c.airport ?? null, localTransit: c.localTransit ?? null },
      );
      for (const o of c.offers) {
        await session.run(
          `MATCH (c:City {name:$city})
           MERGE (cu:Cuisine {name:$cuisine})
           MERGE (c)-[r:OFFERS]->(cu) SET r.spot=$spot`,
          { city: c.name, cuisine: o.cuisine, spot: o.spot },
        );
      }
    }
    const counts = await session.run(
      `MATCH (p:Person) WITH count(p) AS people
       MATCH (c:City)-[:OFFERS]->()
       RETURN people, count(DISTINCT c) AS destinations`,
    );
    const row = counts.records[0];
    console.log(
      `✅ seeded ${row?.get("people")?.toNumber?.() ?? "?"} people, ` +
        `${row?.get("destinations")?.toNumber?.() ?? "?"} destination cities into Aura`,
    );
  } finally {
    await session.close();
    await driver.close();
  }
}

async function verify() {
  const graph = await Neo4jCultureGraph.connect({ uri, user, password });
  try {
    const ids = CULTURE_FACTS.people.map((p) => p.userId);
    const facts = await graph.facts(ids);
    const brief = buildGroupBrief(facts, ids, "Mexico City");
    console.log("\n🔎 read-back from live Aura — Mexico City brief:");
    console.log(`   coverage: ${Math.round((brief.destinationFit?.coverage ?? 0) * 100)}%`);
    for (const line of cultureLines(brief)) console.log(`   ${line}`);
  } finally {
    await graph.close();
  }
}

async function main() {
  if (!uri || !password) {
    console.error("Missing ROCKETRIDE_NEO4J_URI / ROCKETRIDE_NEO4J_PASSWORD in .env");
    process.exit(1);
  }
  await seed();
  await verify();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
