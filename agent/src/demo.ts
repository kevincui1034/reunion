/**
 * Reunion — runnable demo harness.
 *
 * Wires the full spine end-to-end against in-memory stubs so the whole team can
 * develop in parallel and see the core loop work TODAY:
 *
 *   message → gate → extract → intent → route → plan → nextAction → channel
 *
 * Run with: `npm run demo`
 */
import { createClients, config } from "./config.js";
import { classify } from "./gate/index.js";
import { extract } from "./pipeline/extract.js";
import { resolveExtract } from "./pipeline/extractRocketRide.js";
import { classifySignalStrength } from "./pipeline/intent.js";
import { route } from "./pipeline/route.js";
import { plan } from "./pipeline/plan.js";
import { nextAction } from "./pipeline/nextAction.js";
import { ConsoleChannel } from "./channel/index.js";
import { computeCandidateWeekends } from "./planning/when/availability.js";
import { resolveAvailability, type AvailabilityResolver } from "./planning/when/availabilityResolver.js";
import { resolveItinerary } from "./planning/what/itinerary.js";
import { resolveCultureGraph } from "./state/neo4j.js";
import { buildGroupBrief } from "./planning/what/culture.js";
import {
  GROUP_ID,
  displayName,
  mockCalendar,
  sampleConversation,
} from "./mocks/seed.js";
import type { IncomingMessage } from "./contracts/index.js";

async function main() {
  const clients = createClients();
  const channel = new ConsoleChannel();
  const calendar = mockCalendar();
  const window: IncomingMessage[] = [];

  // Heuristic stub by default; flips to the real RocketRide pipeline when
  // ROCKETRIDE_* is set and USE_STUBS=false. Degrades back on any engine failure.
  const doExtract = resolveExtract(
    { useStubs: config.useStubs, rocketride: config.rocketride },
    extract,
  );
  const extractMode = !config.useStubs && config.rocketride ? "RocketRide" : "heuristic";

  // Availability: Kevin's live calendar endpoint when configured, else the in-process
  // interval engine over the mock calendar. Degrades to the stub on any endpoint error.
  const stubAvailability: AvailabilityResolver = async (_trip, ids) => ({
    candidates: computeCandidateWeekends({ participants: ids, windowKind: "weekend" }, calendar),
    pendingConnects: [],
  });
  const doAvailability = resolveAvailability(
    { useStubs: config.useStubs, calendar: config.calendar },
    stubAvailability,
  );
  const availMode = !config.useStubs && config.calendar ? "calendar API" : "stub";

  // Itinerary: RocketRide pipeline when configured, else the deterministic template.
  const doItinerary = resolveItinerary({ useStubs: config.useStubs, rocketride: config.itinerary });

  // Neo4J culture graph (live Aura when configured, else in-memory stub). Recalls
  // each friend's heritage/cuisine/origin and decides per-person food + destination.
  const cultureGraph = await resolveCultureGraph({ useStubs: config.useStubs, neo4j: config.neo4j });
  const cultureMode = !config.useStubs && config.neo4j ? "Neo4J/Aura" : "stub";
  const cultureBrief = async (ids: string[], dest: string | null) => {
    try {
      return buildGroupBrief(await cultureGraph.facts(ids), ids, dest);
    } catch {
      return null; // degrade — summary just omits the personalized lines
    }
  };

  console.log(
    `🛳️  Reunion — core loop demo (extract: ${extractMode} · availability: ${availMode} · culture: ${cultureMode})\n` +
      "=".repeat(48),
  );

  for (const message of sampleConversation()) {
    window.push(message);
    console.log(`\n💬 ${displayName(message.senderId)}: ${message.text}`);

    // ── Stage 1: on-device gate ──
    const verdict = classify(window);
    if (!verdict.wake) {
      console.log(`   🚪 gate: skip (${verdict.reason})`);
      continue;
    }
    console.log(`   🚪 gate: WAKE — ${verdict.reason}`);

    // ── Stage 2: extraction (RocketRide) ──
    const signal = await doExtract(window, displayName);
    const strength = classifySignalStrength(signal);
    console.log(
      `   🧩 extract: dest=${signal.destination ?? "?"} time=${signal.timeframe ?? "?"} ` +
        `constraints=${signal.constraints.length} prefs=${signal.preferences.length} ` +
        `[${strength.signal} ${Math.round(strength.confidence * 100)}%]`,
    );

    // ── Stage 3: route ──
    const decision = route(signal);
    if (!decision.act) {
      console.log(`   🧭 route: defer — ${decision.reason}`);
      continue;
    }
    console.log(`   🧭 route: act — ${decision.reason}`);

    // ── Stage 4: plan (state + memory + availability + itinerary) ──
    const result = await plan(signal, decision, GROUP_ID, clients, {
      availability: doAvailability,
      generateItinerary: doItinerary,
      cultureBrief,
    });
    console.log(
      `   📦 plan: trip=${result.trip.id} status=${result.trip.status} ` +
        `next=${result.nextStep} candidates=${result.candidates.length}` +
        (result.chosenWindow ? ` chosen=${result.chosenWindow.label}` : ""),
    );
    if (result.pendingConnects.length) {
      console.log(
        `   📨 connect links to DM (Photon): ` +
          result.pendingConnects.map((p) => p.handle).join(", "),
      );
    }

    // ── Stage 5: next move → channel ──
    const move = nextAction(result, GROUP_ID);
    await channel.send(move);
  }

  // ── The "memory moment" (M2): a contradiction REVISES a belief ──
  console.log("\n" + "=".repeat(48));
  console.log("🧠 Memory moment — belief revision\n");
  console.log(`💬 ${displayName("u_kevin")}: actually I can do weekdays now`);
  await clients.memory.write({
    subjectId: "u_kevin",
    subjectKind: "user",
    predicate: "availability",
    value: "weekdays ok",
    confidence: 0.9,
    source: "m_revision",
    ts: Date.now(),
  });
  const current = await clients.memory.current("u_kevin", "availability");
  const all = await clients.memory.history("u_kevin", "availability");
  console.log(`   XTrace now believes: "${current[0]?.value}"`);
  console.log(
    `   superseded: ${all.filter((f) => f.superseded).map((f) => `"${f.value}"`).join(", ") || "(none)"}`,
  );
  await cultureGraph.close();
  const backends = config.useStubs
    ? "in-memory stubs"
    : `live tools (extract: ${extractMode}, culture: ${cultureMode}, XTrace + Butterbase)`;
  console.log(`\n✅ end-to-end spine ran on ${backends}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
