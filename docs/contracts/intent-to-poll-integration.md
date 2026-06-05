# Integration Contract: Intent Classification → Availability Poll → User Roster

**Status:** Draft  
**Branch:** `feature/photon-imessage-integration-contract`  
**Date:** 2026-06-05  
**Platform:** iMessage only

## Purpose

Define the boundary contract between Reunion's intent layer and Photon's iMessage layer for the first coordination artifact: a native availability poll sent to the group chat, ending with a structured user roster.

**Photon is the iMessage connector.** Inbound text arrives via Spectrum (`spectrum-ts` + iMessage provider); poll create/vote/parse always goes through `@photon-ai/advanced-imessage-kit`. Both are Photon surfaces and are shown as a single connector participant below.

## Integration boundaries (ownership)

The contract is the seam between independently built components. Each owner implements their side and taps in once their part is done:

| Component | Owner role | Responsibility |
|-----------|------------|----------------|
| **Photon** | Connector | Inbound text (Spectrum webhook) + native poll create/vote/parse (advanced-imessage-kit) |
| **RocketRide** | Orchestration | Runs the intent gate, drives the poll flow, normalizes votes, emits the roster |
| **XTrace** | Knowledge | Stores group-chat knowledge: roster facts, participants, group context |
| **Butterbase** | State | Transactional trip/poll/vote state and plan artifacts |

## Flow overview

```mermaid
sequenceDiagram
    participant Chat as iMessage Group Chat
    participant PH as Photon (Spectrum + advanced-imessage-kit)
    participant RR as RocketRide
    participant IC as Intent Classifier
    participant BB as Butterbase (state)
    participant XT as XTrace (knowledge)

    Chat->>PH: inbound message
    PH->>RR: webhook event (Spectrum)
    RR->>IC: classify(message)
    IC-->>RR: IntentClassificationResult
    alt travel_intent >= threshold
        RR->>BB: upsert Trip + Group context
        RR->>PH: CreateAvailabilityPollRequest
        PH->>Chat: native iMessage poll
        Chat-->>PH: poll votes (async)
        PH-->>RR: PollVoteRecord (first vote only)
        RR->>BB: persist Poll + votes
        RR-->>RR: emit UserRoster
        RR->>XT: write group knowledge + roster facts
    else below threshold
        RR-->>Chat: no action
    end
```

## Step 1 — Input: Intent classification

Produced by RocketRide's first-pass classifier (ADR-007, ADR-014). Downstream steps MUST NOT run unless this contract's gate passes.

### `IntentClassificationResult`

```json
{
  "message_id": "string",
  "chat_guid": "string",
  "platform": "imessage",
  "text": "string",
  "classified_at": "ISO-8601",
  "travel_intent": {
    "detected": true,
    "confidence": 0.0,
    "signal": "explicit_planning | destination_mention | date_mention | mixed"
  },
  "extracted": {
    "destination": "string | null",
    "timeframe": "string | null",
    "participants_mentioned": ["string"]
  },
  "should_orchestrate": true
}
```

### Gate rules

| Rule | Value |
|------|-------|
| `should_orchestrate` | Must be `true` |
| `travel_intent.detected` | Must be `true` |
| `travel_intent.confidence` | Must be ≥ `0.6` (tunable) |
| `platform` | Must be `imessage` |
| Required routing field | `chat_guid` (e.g. `iMessage;+;chat123456`) |

If the gate fails, the pipeline returns `NoOp` and does not call the iMessage SDK.

## Step 2 — Action: Create availability poll

RocketRide emits a `CreateAvailabilityPollRequest` to the iMessage adapter.

### `CreateAvailabilityPollRequest`

```json
{
  "correlation_id": "uuid",
  "trip_id": "uuid | null",
  "target": {
    "chat_guid": "string",
    "platform": "imessage"
  },
  "poll": {
    "title": "Can everyone make this trip?",
    "options": ["Yes", "No", "Maybe"],
    "kind": "availability"
  },
  "context": {
    "destination": "string | null",
    "timeframe": "string | null",
    "trigger_message_id": "string"
  }
}
```

### Poll semantics

| Option | Meaning |
|--------|---------|
| **Yes** | Participant is in / available for the trip |
| **No** | Participant cannot make it |
| **Maybe** | Tentative — wants to go but has open constraints |

### iMessage adapter

```typescript
import { SDK } from "@photon-ai/advanced-imessage-kit";

const poll = await sdk.polls.create({
  chatGuid: request.target.chat_guid,
  title: request.poll.title,
  options: request.poll.options,
});
```

### `CreateAvailabilityPollResponse`

```json
{
  "correlation_id": "uuid",
  "poll_id": "uuid",
  "external_poll_guid": "string",
  "status": "sent | failed",
  "sent_at": "ISO-8601",
  "error": "string | null"
}
```

`external_poll_guid` maps to `poll.guid` from `sdk.polls.create`.

### Participant snapshot

At poll creation, capture the target group's participant set via `sdk.chats.getChats()` → `participants` and persist it alongside the poll. This snapshot is the denominator for completion ("all voted") and for the pending set in a partial roster.

## Step 3 — Async: Collect votes

The iMessage adapter listens on `sdk.on('new-message')` and normalizes poll vote events.

```typescript
import {
  isPollMessage,
  isPollVote,
  parsePollVotes,
  getOptionTextById,
} from "@photon-ai/advanced-imessage-kit";

sdk.on("new-message", (message) => {
  if (!isPollMessage(message) || !isPollVote(message)) return;
  const vote = parsePollVotes(message);
  // normalize to PollVoteRecord, then apply first-vote-wins (see below)
});
```

### Vote uniqueness (v1: first-vote-wins)

A participant's **first** vote on a poll is persisted; subsequent votes for the same `(poll_id, participant_handle)` are **ignored** (no rewrites in v1). iMessage allows changing a vote, but v1 deliberately does not track revisions. Implement as insert-if-absent on `(poll_id, participant_handle)`; emit `vote.ignored` for later votes.

### iMessage vote event (native)

```json
{
  "event": "poll_vote",
  "poll_message_guid": "string",
  "chat_guid": "string",
  "votes": [
    {
      "participant_handle": "+14155551234",
      "option_identifier": "string",
      "option_text": "Yes"
    }
  ]
}
```

### Normalized `PollVoteRecord`

```json
{
  "poll_id": "uuid",
  "participant_handle": "string",
  "option_identifier": "string",
  "option_text": "Yes | No | Maybe",
  "voted_at": "ISO-8601"
}
```

`option_identifier` is retained as the stable key from the native event; `option_text` is the human-readable label resolved via `getOptionTextById`.

### Completion trigger

Emit `PollCompletedEvent` when either:

- All known group participants have voted, or
- A timeout elapses (default: 24h for demo, 48h production), or
- An operator sends `what's next?` / `summarize the trip`

## Step 4 — Output: User roster (terminal artifact)

The flow **ends** by emitting a `UserRoster` JSON object. This is the knowledge handoff: roster facts and group context are written to **XTrace** (the group-chat knowledge layer), while poll/trip/vote **state** already lives in Butterbase.

### `UserRoster`

```json
{
  "correlation_id": "uuid",
  "trip_id": "uuid",
  "poll_id": "uuid",
  "generated_at": "ISO-8601",
  "complete": true,
  "users": [
    {
      "name": "Alice Chen",
      "phone_number": "+14155551234",
      "availability": "yes"
    },
    {
      "name": "Bob Martinez",
      "phone_number": "+14155559876",
      "availability": "maybe"
    }
  ]
}
```

`complete` is `true` when every participant in the snapshot voted; `false` when the roster is emitted on timeout (see `PARTIAL_ROSTER`).

### `User` field rules

| Field | Type | Source | Required |
|-------|------|--------|----------|
| `name` | `string` | Contacts lookup via `nameMap.get(handle)` (built from `sdk.contacts.getContacts()`); fallback to `participant_handle` | Yes |
| `phone_number` | `string` | E.164 from `participant_handle` | Yes |
| `availability` | `"yes" \| "no" \| "maybe"` | The participant's persisted (first) vote `option_text`, lowercased | Yes |

### Inclusion rules

A user appears in `users` when:

1. They are a participant in the target iMessage group chat, **and**
2. They cast a vote on the availability poll (any of `Yes` / `No` / `Maybe`).

Their `availability` carries the actual vote, so downstream consumers (not this contract) decide who is "in." Non-voters are excluded from the roster but may be tracked separately in Butterbase as `TripParticipant.status = "pending"`.

### Name resolution algorithm

```
contacts = sdk.contacts.getContacts()
nameMap = {}
for each c in contacts:
  name = c.displayName ?? c.firstName ?? ""
  for each address in (c.phoneNumbers + c.emails):
    if name: nameMap[address] = name

for each voted participant_handle:
  name = nameMap[handle] ?? handle
  phone_number = normalizeE164(handle)
  availability = lowercase(first_vote.option_text)
  append { name, phone_number, availability }
```

## Error contract

| Error code | Condition | Behavior |
|------------|-----------|----------|
| `INTENT_GATE_FAILED` | Classifier below threshold | NoOp, no SDK call |
| `MISSING_CHAT_GUID` | `chat_guid` absent or invalid | Fail fast, log |
| `POLL_SEND_FAILED` | `sdk.polls.create` error | Retry 2x, then surface to chat |
| `PARTIAL_ROSTER` | Timeout with <100% votes | Emit roster with voted users only; set `complete: false` |

Vote changes are not an error: a later vote for an already-voted `(poll_id, participant_handle)` is silently dropped and logged as `vote.ignored`.

## Idempotency

- `correlation_id` is generated once per intent-triggered poll.
- **Poll-creation dedup key:** `trigger_message_id`. Duplicate classifier hits for the same `message_id` MUST NOT create duplicate polls. When `trip_id` is null, dedup additionally on `(chat_guid, poll.kind)` so the first availability poll for a chat isn't duplicated before a trip exists.
- Butterbase stores a `(trip_id, poll.kind)` unique constraint for `availability` once `trip_id` is assigned.
- **Vote dedup:** first vote per `(poll_id, participant_handle)` wins (see Step 3).

## Observability (demo / judges)

RocketRide pipeline stages should log:

1. `intent.classified` — confidence + extracted entities
2. `poll.requested` — `chat_guid` + options
3. `poll.sent` — `external_poll_guid`
4. `poll.vote.received` — per `participant_handle`
5. `vote.ignored` — duplicate vote dropped (first-vote-wins)
6. `roster.emitted` — final `users` array + `complete`
7. `knowledge.written` — roster + group context persisted to XTrace

## Resolved decisions

1. **Inbound path** — Spectrum iMessage webhooks trigger the classifier (inbound text only); poll **votes** always arrive via advanced-imessage-kit `sdk.on('new-message')`.
2. **Poll options** — `Yes` / `No` / `Maybe`.
3. **Vote changes** — first-vote-wins in v1; no revisions tracked.

## Open decisions

1. **Completion timeout** — 24h demo default vs configurable per trip.
2. **Non-voter representation in XTrace** — omit (current) vs record as `status: "pending"` knowledge.

## Related docs

- `docs/connections/imessage.md`
- `docs/connections/photon-spectrum.md` — Spectrum iMessage provider (inbound only)
- `docs/PRD.md` — FR1, FR5, FR6
- `ADR/ADR-007` — local intent filter
- `ADR/ADR-013` — RocketRide orchestration
