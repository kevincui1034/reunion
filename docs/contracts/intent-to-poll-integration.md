# Contract — Intent → Poll integration

**Owner of this half:** intent gate (this repo). **Status:** upstream half only.
**Shared backend:** Butterbase app `app_4lls3kxgops9`.

The on-device intent gate detects travel intent in the group chat and writes one
`intent_events` row per detected message. This is the **upstream** output. It does
**not** directly call the calendar component's `POST /api/availability`. A middle
**RocketRide** step must translate the row into that call (see Gaps below).

Rationale: ADR-007/014 (filter intent locally before cloud — only YES is forwarded),
ADR-002/012 (first output is a coordination artifact / poll), ADR-005/017
(Butterbase = state), ADR-006 (V1 destination-known — the row carries the location).

## What the intent gate writes

When a Dev-group message classifies as travel intent (and `confidence >=
REUNION_MIN_CONFIDENCE`, default 0.5), the gate does:

```
POST {BUTTERBASE_BASE_URL}/intent_events
Authorization: Bearer <service key>
content-type: application/json
```

`BUTTERBASE_BASE_URL = https://api.butterbase.ai/v1/app_4lls3kxgops9` (REST-friendly,
app-prefixed). Raw `fetch` — **independent of the calendar repo's patched
`@butterbase/sdk`** (whose base is the bare `https://api.butterbase.ai`).
**Do not normalize the two base URLs** — each is correct for its transport.

### `intent_events` row shape

| column | type | example |
|---|---|---|
| id | uuid (pk, server default) | addressable row id for downstream PATCH/DELETE |
| message_id | text (unique) | iMessage message id — dedup key |
| channel | text | "iMessage" |
| chat_id | text | imessage-kit chat id |
| chat_name | text? | "Dev" |
| chat_kind | text | "group" / "dm" |
| sender | text | "+15551234567" or "me" |
| is_from_me | boolean | true |
| text | text | "Who's down to go Miami?" |
| context_window | text | last-5 messages joined (the classified window) |
| is_travel_intent | boolean | true (only YES rows are written) |
| confidence | float8 | 0.9 |
| location | text? | "Miami" |
| created_at | text | ISO 8601, app-supplied |

Read it back: `GET {base}/intent_events?order=created_at.desc` (Bearer service key).

## Gaps the downstream owner (RocketRide) must close

This contract delivers detection only. Before integration day:

1. **Row ≠ `/api/availability` input.** The calendar endpoint
   (`app/api/availability/route.ts`) requires `trip_id`, `window {start, end}`, and
   `[{phone}]` plus the `x-internal-key` header. None are in the row. RocketRide must:
   - resolve `chat_id → participant phone numbers` — **this mapping does not exist
     yet** in either repo and is not produced by the gate;
   - apply a date window (ADR-011 default-weekend for the demo) — confirm the
     RocketRide owner has committed to this rule;
   - mint a `trip_id`;
   - call `POST /api/availability` with `x-internal-key`.
2. **`source:"plaintext"` availability is not fed.** `INTERFACE.md` allows a
   plaintext fallback for participants who haven't connected a calendar. The gate
   keeps only the triggering message + its window, **not** the rest of the thread.
   Pulling free-text availability lines out of the chat is a separate RocketRide read.
3. **Dedup caveat.** `message_id` is unique; a resent/recycled id would silently
   drop a real second intent. Acceptable for the demo.

## Schema-change safety (shared app)

`intent_events` was added via `POST {base}/schema/apply`. The apply engine is
**declarative-authoritative, not additive** — a payload omitting `participants` /
`oauth_tokens` returns `409 SCHEMA_DESTRUCTIVE_CHANGE`. The applied payload therefore
included both of those tables **verbatim** alongside `intent_events`; the dry-run SQL
was three non-destructive `CREATE`s (table + two indexes) with no DROP/ALTER on the
calendar tables. **Coordinate any future schema change** with the calendar owner;
the canonical declarative source for their tables is `scripts/provision-butterbase.mts`.
