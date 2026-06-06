# Integration Contract: Butterbase → Landing Trace Panel

**Status:** Draft
**Branch:** `feature/intent-tracer-landing`
**Date:** 2026-06-05
**Surface:** Public web (Next.js landing app)

## Purpose

Define the boundary between Butterbase (canonical event store) and the Reunion landing page's "Intent Tracer" — a public, animated visualization of the model-of-thought journey from *intent detected in a group chat* → *calendars cross-checked* → *itinerary drafted*.

The landing renders the same lifecycle that backs the production app (see `docs/contracts/intent-to-poll-integration.md`), but as a **read-only, redacted projection** intended for prospective users — not operators. The UI is already coded against a typed `TraceEventSource` interface; today it's backed by a scripted mock, and this contract defines the swap to live Butterbase reads.

## Integration boundaries (ownership)

| Component | Owner role | Responsibility |
|-----------|------------|----------------|
| **Butterbase** | Backend state | Source of truth for `intent_events`; broadcasts realtime INSERTs when configured |
| **Landing — server (Next.js Route Handler)** | Proxy + redactor | Holds the `bb_sk_…` service key; opens WSS to Butterbase; redacts PII; re-emits to browser via SSE |
| **Landing — client (`TraceEventSource`)** | Render | Consumes SSE; appends to local trace; derives the right-hand action panel state |
| **Landing — script (`mockSource.ts`)** | Fallback | Scripted demo events; shipped today, used when `NEXT_PUBLIC_TRACE_MODE != "live"` |

The credential boundary is non-negotiable: **the service key never reaches the browser.** The Next.js Route Handler is the only consumer of `BUTTERBASE_API_KEY`.

## Source: Butterbase

Per `docs/connections/butterbase.md`: AI-optimized BaaS with managed PostgreSQL, JWT auth, S3-compatible storage, an auto-generated REST API, and an OpenAI-compatible AI gateway.

- App: `app_4lls3kxgops9`
- Base: `https://api.butterbase.ai/v1/app_4lls3kxgops9`
- Auth: Bearer token; `bb_sk_…` → `butterbase_service` role (full access; **server-side only**)
- RLS: not yet configured. Anonymous reads currently work but are **not** an allowed channel for the landing — the proxy is mandatory until RLS lands.

### Stage 1 source — `intent_events`

| Column | Use in trace |
|--------|--------------|
| `message_id` | Trace event id |
| `chat_name` | Right-panel "group chat" card |
| `is_travel_intent` | Filter (`eq.true`) |
| `confidence` | Trace row confidence meter |
| `location` | Right-panel "destination" |
| `created_at` | Trace row timestamp; ordering key |
| `sender`, `text`, `context_window` | **Redacted** — never forwarded to browser |

Ordering: `order=created_at.desc`. Backfill on first connect: `GET /intent_events?is_travel_intent=eq.true&order=created_at.desc&limit=20`.

### Stages 2 + 3 source — open

"Calendar check" and "itinerary drafted" have no first-class event rows in the current schema. Options, in order of preference:

1. **New `trace_events` table** owned by RocketRide — purpose-built for the public trace, carrying only fields safe to broadcast.
2. **Inferred** from `polls` INSERT (→ calendar/slot stage) and `trips` UPDATE (→ itinerary stage). Cheaper, but couples the landing to internal table shapes.

Until either is wired, the scripted mock continues to drive stages 2 + 3.

## Transport

```
Butterbase WSS  ──►  Next.js Route Handler  ──SSE──►  Browser
   (server key)       (redact + filter)              (EventSource)
```

- **Butterbase → server:** `wss://api.butterbase.ai/v1/{app_id}/realtime`. Subscribe message:
  ```json
  { "type": "subscribe", "table": "intent_events", "filter": { "is_travel_intent": true } }
  ```
  Handler reacts to `{ "type": "change", "op": "INSERT" }`.
- **Server → browser:** `text/event-stream` from `app/api/trace/route.ts`. One SSE `data:` frame per redacted `TraceEvent`.
- **Reconnect:** server uses REST backfill (`GET /intent_events?...&limit=20`) on each new WSS session; client SSE auto-reconnects with `EventSource`.

## TraceEvent shape (the wire contract to the browser)

```ts
{
  id: string;                   // synthesized from message_id
  stage: "intent" | "calendar" | "itinerary";
  kind: "intent_detected" | "calendar_query" | "slot_proposed" | "itinerary_drafted" | ...;
  at: string;                   // ISO timestamp
  label: string;                // headline, safe-for-public
  thought?: string;             // model-of-thought line, safe-for-public
  detail?: Record<string, ...>; // structured payload, redacted
  confidence?: number;
}
```

This matches `lib/trace/types.ts` in the landing app — the same type the scripted mock already emits.

### Redaction rules (server → browser)

| Field | Action |
|-------|--------|
| `sender` | **Drop.** |
| `text` (raw message body) | **Drop.** |
| `context_window` | **Drop.** |
| `chat_name` | Allowed only if the demo runs against a sandboxed/synthetic chat. For live group chats: hash or replace with a friendly placeholder. |
| `location` | Allowed (coarse city level only). |
| `confidence`, `created_at`, derived `kind`/`stage` | Allowed. |

Redaction happens **inside the Route Handler**, before the SSE write. The client has no way to recover original fields.

## Configuration

Server-side (`.env.local`, unprefixed → never bundled to browser):
- `BUTTERBASE_BASE_URL=https://api.butterbase.ai/v1`
- `BUTTERBASE_APP_ID=app_4lls3kxgops9`
- `BUTTERBASE_API_KEY=bb_sk_...`

Client-visible:
- `NEXT_PUBLIC_TRACE_MODE=mock | live` — switches `getTraceSource()` between `mockSource` and `butterbaseSource`.

## Implementation plan (landing repo paths)

- `lib/butterbase/client.ts` — server-only WSS subscribe + REST backfill.
- `app/api/trace/route.ts` — SSE Route Handler; opens WSS, redacts, streams.
- `lib/trace/butterbaseSource.ts` — client `EventSource('/api/trace')` adapter implementing `TraceEventSource`.
- Flip `NEXT_PUBLIC_TRACE_MODE=live`.

The UI in `components/TracePanel.tsx` and `components/ActionPanel.tsx` requires zero changes — both already consume the typed `TraceEvent` stream.

## Safeguards

- Per-IP rate limit on `/api/trace` (target: ≤ 1 concurrent SSE per IP, 60s soft timeout on idle).
- Backpressure: server batches events at most 1× per 250ms to the browser to prevent UI floods.
- Kill switch: if `BUTTERBASE_API_KEY` is missing, the Route Handler returns `503` and the client falls back to `mockSource` automatically.

## Open questions

1. **Realtime enabled on `app_4lls3kxgops9`?** Docs note `configure_realtime({ tables: ["intent_events"] })` is required. Verify with `GET /v1/{app_id}/realtime/config`.
2. **Stages 2 + 3 — new `trace_events` table or inferred?** This affects RocketRide scope.
3. **Public demo data source.** Live group chats (privacy review + hard redaction) or sandboxed synthetic chat? Determines whether `chat_name` ever leaves the proxy raw.
4. **RLS timeline.** Once RLS + a demo-only view exist, a publishable key could let the browser subscribe directly — confirm Butterbase publishable-key support.
5. **Expected event volume on the landing.** Drives SSE vs. batched polling, and the backpressure window.
