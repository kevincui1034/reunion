/**
 * The culture knowledge graph — single source of truth.  [Jossue]
 *
 * The four friends, their heritage/cuisine/diet, and the city they fly from, plus
 * candidate destinations wired to the cuisines they offer. Both the in-memory
 * `CultureGraph` stub AND the Neo4J seed script (`scripts/seed-culture-graph.ts`)
 * read from THIS object, so the stub and the live Aura graph never drift.
 */
import type { CultureFacts } from "../contracts/index.js";

export const CULTURE_FACTS: CultureFacts = {
  people: [
    { userId: "u_jossue", displayName: "Jossue", heritage: "Salvadoran", cuisine: "Pupusas", diet: null, homeCity: "Newark", originAirport: "EWR" },
    { userId: "u_pablo", displayName: "Pablo", heritage: "Mexican", cuisine: "Tacos al pastor", diet: null, homeCity: "Los Angeles", originAirport: "LAX" },
    { userId: "u_kevin", displayName: "Kevin", heritage: "Chinese", cuisine: "Dim sum", diet: null, homeCity: "San Francisco", originAirport: "SFO" },
    { userId: "u_ethan", displayName: "Ethan", heritage: "Texan", cuisine: "Tex-Mex", diet: "vegetarian", homeCity: "Austin", originAirport: "AUS" },
  ],
  cities: [
    {
      name: "Mexico City",
      airport: "MEX",
      localTransit: "Metro + walkable Roma/Condesa, cheap rideshare",
      offers: [
        { cuisine: "Pupusas", spot: "a Salvadoran pupusería in Roma Norte" },
        { cuisine: "Tacos al pastor", spot: "al pastor at El Huequito" },
        { cuisine: "Dim sum", spot: "dim sum in Barrio Chino" },
        { cuisine: "Tex-Mex", spot: "veggie-friendly Tex-Mex in Condesa" },
      ],
    },
    {
      name: "Los Angeles",
      airport: "LAX",
      localTransit: "you'll want a car or rideshare — it's spread out",
      offers: [
        { cuisine: "Pupusas", spot: "pupuserías in Westlake" },
        { cuisine: "Tacos al pastor", spot: "al pastor in Boyle Heights" },
        { cuisine: "Dim sum", spot: "dim sum in the San Gabriel Valley" },
        { cuisine: "Tex-Mex", spot: "veggie Tex-Mex on the Eastside" },
      ],
    },
    {
      name: "New York",
      airport: "JFK",
      localTransit: "subway everywhere, very walkable",
      offers: [
        { cuisine: "Pupusas", spot: "pupusas in Jackson Heights" },
        { cuisine: "Tacos al pastor", spot: "al pastor in Bushwick" },
        { cuisine: "Dim sum", spot: "dim sum in Flushing" },
        { cuisine: "Tex-Mex", spot: "veggie Tex-Mex in the East Village" },
      ],
    },
    {
      name: "Austin",
      airport: "AUS",
      localTransit: "rideshare-friendly; downtown is walkable",
      offers: [
        { cuisine: "Tacos al pastor", spot: "breakfast tacos on East 6th" },
        { cuisine: "Tex-Mex", spot: "veggie Tex-Mex on Rainey St" },
      ],
    },
  ],
};
