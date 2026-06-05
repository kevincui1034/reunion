# Integration Contract: RocketRide → Calendar (`/api/trip-availability`)

**Status:** Active
**Owner (this side):** Calendar component (Kevin)
**Owner (caller):** RocketRide
**Upstream:** [`intent-to-poll-integration.md`](./intent-to-poll-integration.md) — Photon writes the Trip row to Butterbase.
**Repo seam:** [INTERFACE.md](../../INTERFACE.md) (legacy phones+window contract; superseded by this doc).

## What this endpoint does

After Photon writes a `trips` row to Butterbase, RocketRide hits this endpoint with the `trip_id`. The calendar component:

1. Reads the trip from Butterbase (`destination`, `timeframe`, `chat_guid`).
2. Parses `timeframe` into an ISO `{ start, end }` window (fallback: today → today + 90 days).
3. Pulls Google Calendar freebusy for each of the **four hardcoded demo phones** (Pablo, Kevin, Ethan, Jossue) — this is the V1 hackathon assumption that the whole group is implicitly in.
4. Upserts one row per phone into `trip_participants (trip_id, handle, status, availability)`, writing a JSON blob into the `availability` column.
5. Returns a summary response so RocketRide/XTrace can continue without re-reading Butterbase if it doesn't want to.

There is **no poll, no roster, no inclusion filtering**. Whoever's in `DEMO_PARTICIPANTS` is in the trip.

## Endpoint

| | |
|---|---|
| Method | `POST` |
| Path | `/api/trip-availability` |
| Base URL | `https://reunion-calendar.vercel.app` |
| Auth header | `x-internal-key: ${INTERNAL_API_KEY}` |
| Content-Type | `application/json` |
| Idempotent? | Yes — same `trip_id` → same upserts. Safe to retry. |
| Side effects | Upserts 4 rows into `trip_participants`. May create rows in `participants` table for first-contact phones. Never touches `oauth_tokens`. |

## Request

```json
{ "trip_id": "string" }
```

That's the entire body. The `trip_id` must reference an existing row in the production `trips` table; a missing row returns HTTP 404.

## Response (200)

```json
{
  "trip_id": "trip_abc123",
  "window": {
    "start": "2026-07-01",
    "end":   "2026-08-01",
    "source": "month"
  },
  "participants": [
    {
      "handle": "+19085256062",
      "name": "Pablo",
      "status": "resolved",
      "source": "freebusy",
      "busy": [{ "start": "2026-07-12T18:00:00Z", "end": "2026-07-12T19:00:00Z" }],
      "free": [{ "start": "2026-07-01T00:00:00Z", "end": "2026-07-12T18:00:00Z" }]
    },
    {
      "handle": "+14086671882",
      "name": "Kevin",
      "status": "needs_connect_link",
      "source": null,
      "busy": [],
      "free": [],
      "connect_url": "https://reunion-calendar.vercel.app/connect?s=<signed-token>"
    }
  ],
  "common_free": [{ "start": "...", "end": "..." }],
  "resolved_count": 1,
  "pending_count": 1
}
```

`window.source` is one of:

| Value | What it means |
|---|---|
| `iso-range` | Parsed a literal `YYYY-MM-DD..YYYY-MM-DD` out of `Trip.timeframe`. |
| `month` | Parsed a month name (e.g. `"july"` or `"july 2026"`) — window covers that month. |
| `fallback` | `Trip.timeframe` was null, empty, or unparseable — defaulted to today through today + 90 days. |

`common_free` is the intersection across `resolved` participants only. Pending participants are silently excluded — they neither contribute nor block.

## What gets written to Butterbase

For each of the 4 hardcoded phones, one row is upserted into `trip_participants`:

```
trip_id      = <the trip_id from the request>
handle       = <E.164 phone>
status       = "resolved" | "pending"
availability = <JSON string, one of the two shapes below>
```

**Resolved shape:**
```json
{
  "status": "resolved",
  "source": "freebusy",
  "busy": [{ "start": "...", "end": "..." }],
  "free": [{ "start": "...", "end": "..." }]
}
```

**Needs-connect shape:**
```json
{
  "status": "needs_connect_link",
  "connect_url": "https://reunion-calendar.vercel.app/connect?s=<signed-token>"
}
```

The connect URL is signed with `STATE_SIGNING_KEY`, time-bounded (~24h), and bound to the specific participant. RocketRide should DM it via Photon to the matching phone, **without** further interpretation.

## Error responses

| HTTP | Body | When |
|---|---|---|
| 400 | `{ "error": "request must include trip_id" }` | Body lacks `trip_id`. |
| 400 | `{ "error": "invalid JSON body" }` | Malformed JSON. |
| 401 | `{ "error": "unauthorized" }` | Missing/wrong `x-internal-key`. |
| 404 | `{ "error": "unknown trip_id: …" }` | No `trips` row for that id. |
| 500 | varies | Upstream Google API hiccup not caught as `TokenRevokedError`. Safe to retry once. |

`TokenRevokedError` collapses to `status: "needs_connect_link"` on that participant — not a 500.

## Timeframe parser — what RocketRide can write

The endpoint accepts whatever Photon/RocketRide stores in `Trip.timeframe`. Currently recognized:

| `Trip.timeframe` value | Resulting window |
|---|---|
| `"2026-07-10..2026-07-20"` | Exact 10-day window |
| `"july"` | Whole month of the next upcoming July |
| `"july 2026"` | Whole month of July 2026 |
| `"jul"` | Same as `"july"` |
| `null` / unrecognized | Today → today + 90 days |

The parser is intentionally permissive — RocketRide can write the user's words back to the row and we'll do our best.

## Minimal TypeScript caller

```ts
async function fetchTripAvailability(tripId: string) {
  const res = await fetch(`${process.env.CALENDAR_BASE_URL}/api/trip-availability`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-key': process.env.CALENDAR_INTERNAL_KEY!,
    },
    body: JSON.stringify({ trip_id: tripId }),
  });
  if (!res.ok) throw new Error(`trip-availability ${res.status}: ${await res.text()}`);
  return res.json();
}
```

## Environment variables on the RocketRide side

| Var | Value |
|---|---|
| `CALENDAR_BASE_URL` | `https://reunion-calendar.vercel.app` |
| `CALENDAR_INTERNAL_KEY` | Same as `INTERNAL_API_KEY` on the calendar side. |

## Legacy endpoint

`POST /api/availability` (the phones+window shape documented previously) is still live for direct phone-list testing — see [INTERFACE.md](../../INTERFACE.md). Production RocketRide flow uses `/api/trip-availability` exclusively.

## Open decisions that belong to RocketRide

1. **Re-DMing connect links**: how often to retry sending `connect_url` to a pending participant between calls.
2. **`Trip.timeframe` writer**: who decides whether to write `"july"` vs `"2026-07-10..2026-07-20"`. Either works; structured ranges produce tighter windows.
3. **Unresolved → blocking?**: whether to wait for all 4 to resolve before generating the itinerary, or proceed with whoever's available.

## What's hardcoded (and where to unhardcode later)

The 4 demo phones live at [lib/demo-participants.ts](../../lib/demo-participants.ts). When Photon starts writing the real chat roster to a table, swap that import for a Butterbase lookup by `chat_guid`. The route handler is the only caller.
