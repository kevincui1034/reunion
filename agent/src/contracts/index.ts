/**
 * CONTRACTS — the typed seams between the four work-streams.
 *
 * These are the ONLY places Pablo (intent), Jossue (what), Kevin (when), and
 * Ethan (poll/channel) touch each other. Build to these and you can work in
 * parallel without blocking. Changing a contract = ping the owner on BOTH sides.
 *
 * Mirror of `.bridge/CONTRACTS.md`. That doc explains the rationale; this file is
 * the compiler-enforced source of truth.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. IncomingMessage — channel → gate/pipeline   (producer: Ethan)
// ─────────────────────────────────────────────────────────────────────────────
export interface IncomingMessage {
  channel: "iMessage" | "telegram";
  groupId: string; // Spectrum space id
  senderId: string; // platform handle, mapped to a User
  text: string;
  ts: number; // epoch ms
  messageId: string; // platform message id (dedup + "what triggered me")
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. IntentVerdict — gate → pipeline   (producer: Pablo / gate)
// ─────────────────────────────────────────────────────────────────────────────
export type IntentSignal = "none" | "weak" | "active" | "command";

export interface IntentVerdict {
  wake: boolean; // false → `continue` the Spectrum loop, do nothing
  signal: IntentSignal;
  triggeringMessageIds: string[]; // which msgs tipped it (explainability, FR1)
  reason?: string; // short human-readable trigger explanation
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TripSignal — extraction → router/planning   (producer: Pablo, consumer: Jossue)
//    Missing fields are null/empty — NEVER hallucinated. (FR2)
// ─────────────────────────────────────────────────────────────────────────────
export type TripPath = "destination-known" | "time-known" | "open-ended";

export interface ParticipantRef {
  userId: string;
  displayName: string;
}

export interface Constraint {
  userId: string | null;
  kind: "availability" | "budget" | "diet" | "other";
  value: string;
}

export interface Preference {
  userId: string | null;
  kind: "lodging" | "food" | "activity" | "destination";
  value: string;
}

export interface TripSignal {
  path: TripPath; // V1 only ACTS on "destination-known"
  destination: string | null;
  timeframe: string | null; // rough, e.g. "July"
  participants: ParticipantRef[];
  constraints: Constraint[];
  preferences: Preference[];
  openQuestions: string[];
  confidence: number; // 0..1
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Trip (+ TripParticipant) — Butterbase system of record   (owner: Jossue)
// ─────────────────────────────────────────────────────────────────────────────
export type TripStatus = "forming" | "confirmed" | "scheduling" | "planned";

export interface Trip {
  id: string;
  groupId: string;
  destination: string;
  timeframe: string | null;
  status: TripStatus;
  currentSummary: string; // the "what do we know so far" text
  createdAt: number;
  updatedAt: number;
}

export interface TripParticipant {
  tripId: string;
  userId: string;
  availability?: string;
  budgetPreference?: string;
  dietaryPreferences?: string[];
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Availability — Jossue ↔ Kevin
//    Availability-only (ADR-003). Default weekend window Fri→Mon (ADR-011).
// ─────────────────────────────────────────────────────────────────────────────
export interface AvailabilityQuery {
  participants: string[]; // userIds
  monthsAhead?: number; // default 3 of the mocked 12
  windowKind?: "weekend"; // V1 fixed
}

export interface CandidateWeekend {
  start: number; // Fri midday, epoch ms
  end: number; // Mon, epoch ms
  availableUserIds: string[];
  conflictUserIds: string[];
  score: number; // 0..1 = fraction available (no severity weighting in V1)
  label: string; // "Jul 18–21" for chat rendering
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. OutgoingMove — planning → channel   (producer: Jossue, sender: Ethan)
// ─────────────────────────────────────────────────────────────────────────────
export interface PollSpec {
  question: string;
  choices: { id: string; label: string }[];
}

export interface OptionSpec {
  type: "date" | "lodging" | "activity" | "food" | "destination";
  label: string;
  rationale?: string;
}

export interface OutgoingMove {
  groupId: string;
  text: string; // short, chat-sized (PRD §18)
  cardUrl?: string; // hosted Butterbase page → iMessage URL-unfurl
  poll?: PollSpec;
  options?: OptionSpec[];
}

/**
 * A participant who hasn't connected their calendar yet. Surfaced by planning so
 * the channel layer (Photon) can DM the connect link to that handle. The DM is
 * Ethan's `send`; planning only produces the list.
 */
export interface PendingConnect {
  handle: string; // E.164 phone — also the Photon user handle in iMessage
  connectUrl: string; // Google Calendar connect link to DM
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Fact — XTrace durable memory   (shared: Pablo writes, Jossue reads/writes)
//    Belief revision: a new fact supersedes a contradicting old one. (FR3)
// ─────────────────────────────────────────────────────────────────────────────
export interface Fact {
  id: string;
  subjectId: string; // userId or groupId
  subjectKind: "user" | "group";
  predicate: string; // e.g. "availability", "diet", "destinationInterest"
  value: string;
  confidence: number; // 0..1
  source: string; // messageId or "synthetic-seed"
  ts: number;
  supersedes?: string; // id of the fact this revises
  superseded?: boolean; // true once a newer fact revises this one
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Culture graph — Neo4J knowledge graph of the group   (owner: Jossue)
//    RECALL each person's heritage/cuisine/diet/origin; DECIDE a destination's
//    per-person food picks + how well it covers the whole group's cuisines.
// ─────────────────────────────────────────────────────────────────────────────

/** One person's cultural + travel profile (a graph fact and a brief row). */
export interface PersonBrief {
  userId: string;
  displayName: string;
  heritage: string; // "Salvadoran"
  cuisine: string; // "Pupusas"
  diet: string | null; // "vegetarian" | null
  homeCity: string; // "Newark"
  originAirport: string; // "EWR"
}

/** A per-person food recommendation at a candidate city. */
export interface FoodPick {
  userId: string;
  displayName: string;
  cuisine: string;
  spot: string | null; // "a Roma Norte pupusería", or null if the city lacks it
}

/** How well a city fits the group, plus the per-person picks there. */
export interface DestinationFit {
  city: string;
  airport: string | null; // destination airport code → round-trip framing (there + back)
  localTransit: string | null; // "getting around" note, rendered only when present
  coverage: number; // 0..1 = fraction of the group's cuisines the city offers
  picks: FoodPick[];
}

/** The recall + decide result the planning layer renders into the recap. */
export interface GroupBrief {
  people: PersonBrief[];
  origins: { userId: string; displayName: string; homeCity: string; airport: string }[];
  destinationFit: DestinationFit | null; // when the destination is known
  rankedDestinations: DestinationFit[]; // when open-ended (best coverage first)
}

/** Raw facts fetched from the graph (or stub) — input to buildGroupBrief. */
export interface CityFacts {
  name: string;
  airport?: string; // destination airport code (round-trip framing)
  localTransit?: string; // local getting-around note (optional — "if required")
  offers: { cuisine: string; spot: string }[];
}

export interface CultureFacts {
  people: PersonBrief[];
  cities: CityFacts[];
}
