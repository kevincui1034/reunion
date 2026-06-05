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

  console.log(
    `🛳️  Reunion — core loop demo (extract: ${extractMode})\n` + "=".repeat(48),
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

    // ── Stage 4: plan (state + memory + availability) ──
    const result = await plan(signal, decision, GROUP_ID, clients, {
      availability: (q) => computeCandidateWeekends(q, calendar),
    });
    console.log(
      `   📦 plan: trip=${result.trip.id} status=${result.trip.status} ` +
        `next=${result.nextStep} candidates=${result.candidates.length}`,
    );

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
  console.log("\n✅ end-to-end spine ran on stubs.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
