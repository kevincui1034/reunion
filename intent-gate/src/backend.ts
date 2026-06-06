// Runtime write path to the shared Butterbase app. Raw fetch against the
// REST-friendly, app-prefixed base URL — deliberately independent of the calendar
// repo's patched @butterbase/sdk client (do NOT normalize the two BASE_URL shapes).
//
// This is the UPSTREAM half of the intent -> poll handoff: we persist a detected
// travel-intent event. A downstream RocketRide step is responsible for translating
// chat_id -> participant phones -> trip window -> trip_id -> POST /api/availability.
// See docs/contracts/intent-to-poll-integration.md.

export type IntentEvent = {
  message_id: string; // iMessage message id — unique dedup key
  channel: string; // "iMessage"
  chat_id: string;
  chat_name: string | null;
  chat_kind: string; // "dm" | "group"
  sender: string; // participant handle or "me"
  is_from_me: boolean;
  text: string;
  context_window: string;
  is_travel_intent: boolean;
  confidence: number;
  location: string | null;
  created_at: string; // ISO 8601, app-supplied (matches text-id convention)
};

/**
 * Insert one intent event into Butterbase. Best-effort and non-blocking: a backend
 * failure logs and returns rather than crashing the gate (recoverable on partial
 * failure). A duplicate message_id (unique constraint) is treated as a no-op.
 * Env is read lazily so it picks up process.loadEnvFile() done in index.ts.
 */
export async function sendIntentEvent(event: IntentEvent): Promise<void> {
  const base = process.env.BUTTERBASE_BASE_URL;
  const key = process.env.BUTTERBASE_API_KEY;

  if (!base || !key) {
    console.log(`[backend dry-run] would POST /intent_events: ${JSON.stringify(event)}`);
    return;
  }

  try {
    const res = await fetch(`${base}/intent_events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    if (res.ok) return;
    const body = await res.text();
    if (res.status === 409 || /unique|duplicate/i.test(body)) return; // already forwarded
    console.error(`backend insert failed: ${res.status} ${body.slice(0, 200)}`);
  } catch (err) {
    console.error(`backend insert error: ${(err as Error).message}`);
  }
}
