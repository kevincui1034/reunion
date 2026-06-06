/**
 * CONTRACT FIXTURES — the canonical example at each seam.
 *
 * These pin down *semantics*, not just shape: when Pablo asks "what exactly should
 * a TripSignal look like?", this is the answer the whole team agreed on. Build your
 * consumer against the fixture; assert your producer matches it.
 *
 * The Mexico City demo (PRD §10) is the running example. Keep these in lock-step
 * with `mocks/seed.ts`. Changing a fixture = a seam-semantics change = ping both owners.
 */
import type {
  IncomingMessage,
  IntentVerdict,
  TripSignal,
  Trip,
  CandidateWeekend,
  OutgoingMove,
  Fact,
} from "./index.js";

// Seam 1 — channel → gate/pipeline
export const exampleIncomingMessage: IncomingMessage = {
  channel: "iMessage",
  groupId: "group_reunion_demo",
  senderId: "u_pablo",
  text: "We should go to Mexico City in July",
  ts: 1_750_000_000_000,
  messageId: "m_2",
};

// Seam 2 — gate → pipeline
export const exampleIntentVerdict: IntentVerdict = {
  wake: true,
  signal: "active",
  triggeringMessageIds: ["m_2"],
  reason: "gate woke on active signal (1 cue)",
};

// Seam 3 — extraction → planning  ⭐ the big one
export const exampleTripSignal: TripSignal = {
  path: "destination-known",
  destination: "Mexico City",
  timeframe: "July",
  participants: [
    { userId: "u_pablo", displayName: "Pablo" },
    { userId: "u_kevin", displayName: "Kevin" },
    { userId: "u_ethan", displayName: "Ethan" },
    { userId: "u_jossue", displayName: "Jossue" },
  ],
  constraints: [{ userId: "u_kevin", kind: "availability", value: "weekends only" }],
  preferences: [
    { userId: "u_ethan", kind: "food", value: "vegetarian" },
    { userId: "u_jossue", kind: "lodging", value: "Roma Norte" },
  ],
  openQuestions: ["exact dates"],
  confidence: 0.8,
};

// Seam 4 — Butterbase system of record
export const exampleTrip: Trip = {
  id: "trip_1",
  groupId: "group_reunion_demo",
  destination: "Mexico City",
  timeframe: "July",
  status: "forming",
  currentSummary: "Destination: Mexico City\nTimeframe: July",
  createdAt: 1_750_000_000_000,
  updatedAt: 1_750_000_000_000,
};

// Seam 5 — availability (Jossue ↔ Kevin)
export const exampleCandidateWeekend: CandidateWeekend = {
  start: 1_752_000_000_000,
  end: 1_752_259_200_000, // +3 days
  availableUserIds: ["u_pablo", "u_kevin", "u_ethan", "u_jossue"],
  conflictUserIds: [],
  score: 1,
  label: "Jul 18–21",
};

// Seam 6 — planning → channel
export const exampleOutgoingMove: OutgoingMove = {
  groupId: "group_reunion_demo",
  text:
    "Sounds like a trip is forming. Here's what I have:\n\nDestination: Mexico City\nTimeframe: July\nConstraints: Kevin: weekends only\n\nWant me to start a date poll?",
  poll: {
    question: "Which weekend works?",
    choices: [
      { id: "wk_0", label: "Jul 18–21 (4/4 free)" },
      { id: "wk_1", label: "Jul 25–28 (4/4 free)" },
    ],
  },
};

// Seam 7 — XTrace durable memory
export const exampleFact: Fact = {
  id: "fact_1",
  subjectId: "u_kevin",
  subjectKind: "user",
  predicate: "availability",
  value: "weekends only",
  confidence: 0.9,
  source: "m_3",
  ts: 1_750_000_000_000,
  superseded: false,
};
