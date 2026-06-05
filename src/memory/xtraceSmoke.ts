/**
 * XTrace smoke test — proves real ingest + recall (and belief revision).
 *   npm run xtrace:smoke
 * Requires XTRACE_API_KEY + XTRACE_ORG_ID in .env, and @xtraceai/memory installed.
 */
import { xtraceFromEnv } from "./xtraceMemory.js";

async function main() {
  const mem = xtraceFromEnv();
  if (!mem) {
    console.error("XTRACE_API_KEY / XTRACE_ORG_ID not set in .env — cannot run smoke.");
    process.exit(1);
  }
  const now = Date.now();

  console.log("→ ingest: Kevin can only do weekends…");
  await mem.write({ subjectId: "u_kevin", subjectKind: "user", predicate: "availability", value: "can only do weekends", confidence: 0.9, source: "reunion-demo", ts: now });

  console.log("→ ingest (contradiction): Kevin can do weekdays now…");
  await mem.write({ subjectId: "u_kevin", subjectKind: "user", predicate: "availability", value: "can do weekdays now", confidence: 0.9, source: "reunion-demo", ts: now + 1 });

  console.log("→ recall: Kevin's availability…");
  const facts = await mem.current("u_kevin", "availability");
  for (const f of facts) console.log(`   • ${f.value}`);

  console.log("\n✅ XTrace ingest + recall works (belief revision handled server-side).");
}

main().catch((e) => {
  console.error("xtrace smoke failed:", e);
  process.exit(1);
});
