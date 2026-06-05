/**
 * Live RocketRide probe — NOT part of the app. A throwaway harness to learn the
 * engine's behavior against the real extraction pipeline:
 *   - can we connect to the local engine?
 *   - does the pipeline validate + load (`use`)?
 *   - what is the exact shape of `send()`'s result envelope?
 *   - does Claude return clean TripSignal JSON?
 *
 * Run:  npx tsx --env-file=.env scripts/rocketride-probe.ts
 * Needs ROCKETRIDE_URI (local engine) and ROCKETRIDE_ANTHROPIC_KEY in .env.
 */
import { readFileSync } from "node:fs";
import { RocketRideClient } from "rocketride";

const PIPE = "pipelines/extract-trip-signal.pipe";

// Roster so the model emits our stable userIds, not just display names.
const ROSTER = "Roster (name = userId): Kevin=u_kevin, Ethan=u_ethan, Pablo=u_pablo, Jossue=u_jossue.";
const TRANSCRIPT = [
  "Pablo: We should go to Mexico City in July",
  "Kevin: I'm down, but I can only do weekends",
  "Ethan: same, and I'm vegetarian so keep that in mind",
  "Jossue: Roma Norte looks sick",
].join("\n");

const PROMPT = `You extract group-travel planning signal from a chat snippet.
${ROSTER}

Return ONLY a JSON object (no prose, no markdown fence) with this exact shape:
{
  "path": "destination-known" | "time-known" | "open-ended",
  "destination": string | null,
  "timeframe": string | null,
  "participants": [{ "userId": string, "displayName": string }],
  "constraints": [{ "userId": string | null, "kind": "availability"|"budget"|"diet"|"other", "value": string }],
  "preferences": [{ "userId": string | null, "kind": "lodging"|"food"|"activity"|"destination", "value": string }],
  "openQuestions": string[],
  "confidence": number
}
Rules: never invent facts; if something isn't stated, omit it (null or []). Use the roster's userIds.

Conversation:
${TRANSCRIPT}`;

async function main() {
  const client = new RocketRideClient({
    onConnectError: (m) => console.error("⚠️  connectError:", m),
    onProtocolMessage: () => {},
  });

  console.log("URI:", process.env.ROCKETRIDE_URI, "| key set:", !!process.env.ROCKETRIDE_ANTHROPIC_KEY);

  try {
    await client.connect();
    console.log("✅ connected:", client.isConnected());

    const pipeline = JSON.parse(readFileSync(PIPE, "utf8"));
    try {
      const v = await client.validate({ pipeline });
      console.log("🔎 validate:", JSON.stringify(v));
    } catch (e) {
      console.log("🔎 validate threw:", (e as Error).message);
    }

    const used = await client.use({ filepath: PIPE });
    console.log("🚀 use →", JSON.stringify(used));
    const token = used.token;

    const result = await client.send(token, PROMPT, { name: "conversation.txt" }, "text/plain");
    console.log("📦 send result (RAW ENVELOPE):");
    console.log(JSON.stringify(result, null, 2));

    await client.terminate(token);
  } catch (err) {
    console.error("❌ probe error:", err);
  } finally {
    await client.disconnect();
    console.log("👋 disconnected");
  }
}

main();
