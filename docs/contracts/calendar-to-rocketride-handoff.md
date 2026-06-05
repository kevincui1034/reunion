# Handoff to Jossue — RocketRide + XTrace integration

**From:** Calendar component (Kevin)
**To:** Jossue (RocketRide pipeline + XTrace memory)
**Status:** Calendar side is shipped; this doc covers everything you need from here.

## TL;DR

1. Photon writes a `trips` row (already happening).
2. You call `POST /api/trip-availability { trip_id }` → it fills `trip_participants.availability` and returns `common_free`.
3. RocketRide turns destination + `common_free` + (XTrace facts) into an itinerary.
4. **Final step you own:** send the rendered itinerary back into the iMessage chat as **plain text**, via Photon (Spectrum `space.send(text)` in Local mode — no cards, no effects).

See [rocketride-to-calendar.md](./rocketride-to-calendar.md) for the full endpoint contract (request/response/errors). This doc is the wider picture.

## Tables in Butterbase (production)

Provisioned by [scripts/provision-trip-tables.mts](../../scripts/provision-trip-tables.mts) plus the Photon-owned tables. Column names are snake_case.

### `trips` — Photon writes, you read/update
| Column | Type | Notes |
|---|---|---|
| `id` | text (unique) | The `trip_id` you pass to the calendar endpoint. |
| `group_id` / `chat_guid` | text | iMessage chat identifier — Photon's convention is `chat_guid`. **This is what you send back to.** |
| `destination` | text | What RocketRide extracted. |
| `timeframe` | text, nullable | Fuzzy string. Parser accepts `"2026-07-10..2026-07-20"`, `"july"`, `"july 2026"`, `"jul"`. Unrecognized → 90-day fallback. |
| `status` | text | Owned by you — drive the pipeline state machine here. |
| `current_summary` | text | Suggested home for the rendered itinerary text. |
| `created_at` / `updated_at` | bigint | Epoch ms. |

### `trip_participants` — calendar writes, you read
One row per (trip, phone). Calendar upserts these inside `/api/trip-availability`.

| Column | Type | Notes |
|---|---|---|
| `trip_id` | text | FK to `trips.id`. |
| `handle` | text | E.164 phone (also doubles as Photon's user handle in iMessage). |
| `status` | text | `"resolved"` or `"pending"`. |
| `availability` | text (JSON string) | Resolved shape: `{ status, source: "freebusy", busy[], free[] }`. Pending shape: `{ status: "needs_connect_link", connect_url }`. |

Composite unique index on `(trip_id, handle)` — safe to upsert.

### `participants` — calendar owns
`id`, `phone`, `google_email`, `created_at`, `updated_at`. You shouldn't need to touch this; calendar creates rows lazily by phone on first contact.

### `oauth_tokens` — calendar owns, do not touch
Token storage for Google Calendar. Calendar-side only.

## The flow you need to wire

```
Photon → writes trips row (chat_guid, destination, timeframe, status="new")
       → notifies RocketRide with trip_id
            ↓
RocketRide → POST /api/trip-availability { trip_id }
           → response has common_free + per-participant availability
           → for any participant with needs_connect_link: Photon DMs the connect_url
            ↓
RocketRide → reads/writes XTrace facts (budget, diet, airport prefs, etc.)
           → generates itinerary (dates from common_free, destination from trip)
           → writes trips.current_summary, sets trips.status="planned"
            ↓
Photon → sends current_summary as PLAIN TEXT to the iMessage chat (chat_guid)
```

## Sending the final itinerary to iMessage

**This is the step you specifically asked about.**

- Channel layer is Spectrum in **Local mode** (decision locked in CLAUDE.md). Local mode supports **plain text + URL-unfurl cards only** — `customizedMiniApp` / effects / reactions throw.
- The itinerary is rendered server-side as a plain-text string and handed to Photon to call `space.send(text)` (or equivalent inside its message loop).
- Keep it short, terse, and decision-oriented per the PRD personality (§18, §23). Use line breaks, not Markdown — iMessage strips formatting.
- If you want a "tap to view" experience later, render a hosted summary page and append its URL — iMessage will unfurl it. Out of scope for V1.

Suggested shape (one message, plain text):

```
Trip plan — Lisbon, Jul 14–16

Day 1 (Tue)
- Land LIS by noon
- Tapas at Time Out Market
- Sunset at Miradouro da Senhora do Monte

Day 2 (Wed)
...

Reply 👍 if this works.
```

The Photon owner controls the actual `send` call. Your job is to produce the string and trigger the send (likely by writing `trips.status="planned"` and a `current_summary`, and letting Photon's watcher pick it up — confirm the exact handoff with whoever owns Photon).

## XTrace seam — what to read/write

Calendar does **not** read or write XTrace. XTrace is yours. Suggested write points during the pipeline:
- After availability resolves: write a fact per participant — e.g. `availability_window(person, trip_id, ranges)`.
- After itinerary generates: write the chosen `{destination, dates, budget_band}` so future trips inherit context.
- On contradictions (someone said they can't fly United, then approved a United option), let XTrace's belief revision win — newer overrides older.

Calendar only knows freebusy timestamps; everything semantic (movability, preferences, budget) belongs in XTrace.

## Calendar endpoint cheatsheet

```ts
const res = await fetch(`${process.env.CALENDAR_BASE_URL}/api/trip-availability`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-internal-key': process.env.CALENDAR_INTERNAL_KEY!,
  },
  body: JSON.stringify({ trip_id: tripId }),
});
const data = await res.json();
// data.common_free is the intersection over resolved participants.
// data.participants[i].status === 'needs_connect_link' → DM data.participants[i].connect_url to that handle.
```

Env vars on your side:
- `CALENDAR_BASE_URL` = `https://reunion-calendar.vercel.app`
- `CALENDAR_INTERNAL_KEY` = same as my `INTERNAL_API_KEY` (I'll share over a side channel).

Endpoint is idempotent — retry the same `trip_id` safely.

## Hardcoded for the demo (don't be surprised)

The "group" on every trip is the four demo phones in [lib/demo-participants.ts](../../lib/demo-participants.ts) — Pablo, Kevin, Ethan, you (Jossue). There is no roster table yet. When Photon ships a real roster keyed by `chat_guid`, calendar will swap that import for a Butterbase lookup; the endpoint shape won't change.

## Open decisions that belong to you

1. **Block on unresolved?** — Do you wait until all 4 participants are `resolved` before generating the itinerary, or proceed with whoever responded? Today the endpoint just excludes pending people from `common_free`.
2. **`timeframe` writer convention** — `"july"` works, `"2026-07-10..2026-07-20"` produces a tighter window. Pick a default for what RocketRide writes back.
3. **Re-DM cadence for connect links** — how often Photon re-pings a pending participant.

Ping me if any of that needs to change on the calendar side.
