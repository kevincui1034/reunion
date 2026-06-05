/**
 * Butterbase smoke test — proves a real write/read against the live app.
 *   npm run db:smoke
 */
import { butterbaseFromEnv } from "./butterbaseClient.js";
import { ButterbaseStore } from "./butterbaseStore.js";

async function main() {
  const bb = butterbaseFromEnv();
  if (!bb) {
    console.error("BUTTERBASE_* not set in .env — cannot run smoke test.");
    process.exit(1);
  }
  const store = new ButterbaseStore(bb);

  console.log("→ createTrip…");
  const trip = await store.createTrip({
    groupId: "group_smoke",
    destination: "Mexico City",
    timeframe: "July",
    status: "forming",
    currentSummary: "smoke test",
  });
  console.log("  created:", trip.id);

  console.log("→ getTrip…");
  const back = await store.getTrip(trip.id);
  console.log("  read back:", back?.destination, back?.status);

  console.log("→ updateTrip (status=scheduling)…");
  const upd = await store.updateTrip(trip.id, { status: "scheduling", currentSummary: "updated" });
  console.log("  updated:", upd.status, "|", upd.currentSummary);

  console.log("→ findTripByGroup…");
  const found = await store.findTripByGroup("group_smoke");
  console.log("  found by group:", found?.id === trip.id ? "✓ same trip" : "✗ mismatch");

  console.log("\n✅ Butterbase round-trip works — trip persisted as real state.");
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exit(1);
});
