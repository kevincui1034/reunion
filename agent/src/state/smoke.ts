/**
 * Butterbase smoke test — proves a real write/read against the live shared app.
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
  const groupId = `imessage;+;chat_smoke_${Date.now()}`;

  console.log("→ createTrip…");
  const trip = await store.createTrip({
    groupId,
    destination: "Mexico City",
    timeframe: "July",
    status: "forming",
    currentSummary: "smoke test",
  });
  console.log("  created:", trip.id, "chat_guid=", trip.groupId);

  console.log("→ getTrip…");
  const back = await store.getTrip(trip.id);
  console.log("  read back:", back?.destination, "/", back?.timeframe);

  console.log("→ findTripByGroup (by chat_guid)…");
  const found = await store.findTripByGroup(groupId);
  console.log("  found by chat_guid:", found?.id === trip.id ? "✓ same trip" : "✗ mismatch");

  console.log("→ createPoll (date poll on the shared polls table)…");
  const poll = await store.createPoll(trip.id, {
    question: "Which weekend works?",
    choices: [{ id: "wk_0", label: "Jul 18–21" }, { id: "wk_1", label: "Jul 25–28" }],
  });
  console.log("  poll persisted:", poll.id);

  console.log("\n✅ Butterbase live: trip + poll persisted as real state in the shared schema.");
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exit(1);
});
