/**
 * CONTRACT VALIDATORS — runtime guards for the seams.
 *
 * The type system catches shape drift at compile time. These catch *semantic*
 * drift at runtime: required fields present, enums valid, numbers in range, and
 * the "never hallucinate" rules.
 *
 * Use them two ways:
 *   1. In your own code, to self-check output before handing it across a seam:
 *        const signal = myExtract(window);
 *        assertTripSignal(signal);   // throws loudly if you broke the contract
 *   2. In contract tests, run against BOTH the fixture (the agreement) and your
 *      real output (the implementation) — if both pass, the seam holds.
 *
 * Each throws a descriptive Error naming the offending field.
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

function fail(contract: string, msg: string): never {
  throw new Error(`[contract:${contract}] ${msg}`);
}
const isStr = (v: unknown) => typeof v === "string" && v.length > 0;
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const inRange = (v: unknown, lo: number, hi: number) => isNum(v) && (v as number) >= lo && (v as number) <= hi;

export function assertIncomingMessage(m: IncomingMessage): void {
  if (!["iMessage", "telegram"].includes(m.channel)) fail("IncomingMessage", `bad channel: ${m.channel}`);
  if (!isStr(m.groupId)) fail("IncomingMessage", "groupId required");
  if (!isStr(m.senderId)) fail("IncomingMessage", "senderId required");
  if (typeof m.text !== "string") fail("IncomingMessage", "text must be a string");
  if (!isNum(m.ts)) fail("IncomingMessage", "ts must be a number");
  if (!isStr(m.messageId)) fail("IncomingMessage", "messageId required");
}

export function assertIntentVerdict(v: IntentVerdict): void {
  if (typeof v.wake !== "boolean") fail("IntentVerdict", "wake must be boolean");
  if (!["none", "weak", "active", "command"].includes(v.signal)) fail("IntentVerdict", `bad signal: ${v.signal}`);
  if (!Array.isArray(v.triggeringMessageIds)) fail("IntentVerdict", "triggeringMessageIds must be an array");
  // Explainability (FR1): if it woke, it must say what triggered it.
  if (v.wake && v.triggeringMessageIds.length === 0) fail("IntentVerdict", "woke with no triggering messages");
}

export function assertTripSignal(s: TripSignal): void {
  if (!["destination-known", "time-known", "open-ended"].includes(s.path)) fail("TripSignal", `bad path: ${s.path}`);
  if (s.destination !== null && !isStr(s.destination)) fail("TripSignal", "destination must be string|null (never undefined)");
  if (s.timeframe !== null && !isStr(s.timeframe)) fail("TripSignal", "timeframe must be string|null");
  if (!Array.isArray(s.participants)) fail("TripSignal", "participants must be an array");
  if (!Array.isArray(s.constraints)) fail("TripSignal", "constraints must be an array");
  if (!Array.isArray(s.preferences)) fail("TripSignal", "preferences must be an array");
  if (!Array.isArray(s.openQuestions)) fail("TripSignal", "openQuestions must be an array");
  if (!inRange(s.confidence, 0, 1)) fail("TripSignal", `confidence out of [0,1]: ${s.confidence}`);
  // No-hallucination rule (FR2): destination-known REQUIRES a destination.
  if (s.path === "destination-known" && !s.destination) fail("TripSignal", "destination-known path with null destination");
}

export function assertTrip(t: Trip): void {
  if (!isStr(t.id)) fail("Trip", "id required");
  if (!isStr(t.groupId)) fail("Trip", "groupId required");
  if (!isStr(t.destination)) fail("Trip", "destination required");
  if (!["forming", "confirmed", "scheduling", "planned"].includes(t.status)) fail("Trip", `bad status: ${t.status}`);
  if (typeof t.currentSummary !== "string") fail("Trip", "currentSummary must be a string");
  if (!isNum(t.createdAt) || !isNum(t.updatedAt)) fail("Trip", "timestamps must be numbers");
}

export function assertCandidateWeekend(c: CandidateWeekend): void {
  if (!isNum(c.start) || !isNum(c.end)) fail("CandidateWeekend", "start/end must be numbers");
  if (c.end <= c.start) fail("CandidateWeekend", "end must be after start");
  if (!Array.isArray(c.availableUserIds) || !Array.isArray(c.conflictUserIds)) fail("CandidateWeekend", "user id lists required");
  if (!inRange(c.score, 0, 1)) fail("CandidateWeekend", `score out of [0,1]: ${c.score}`);
  if (!isStr(c.label)) fail("CandidateWeekend", "label required for chat rendering");
}

export function assertOutgoingMove(m: OutgoingMove): void {
  if (!isStr(m.groupId)) fail("OutgoingMove", "groupId required");
  if (!isStr(m.text)) fail("OutgoingMove", "text required (every move says something)");
  if (m.poll) {
    if (!isStr(m.poll.question)) fail("OutgoingMove", "poll.question required");
    if (!Array.isArray(m.poll.choices) || m.poll.choices.length === 0) fail("OutgoingMove", "poll needs choices");
  }
}

export function assertFact(f: Fact): void {
  if (!isStr(f.id)) fail("Fact", "id required");
  if (!isStr(f.subjectId)) fail("Fact", "subjectId required");
  if (!["user", "group"].includes(f.subjectKind)) fail("Fact", `bad subjectKind: ${f.subjectKind}`);
  if (!isStr(f.predicate)) fail("Fact", "predicate required");
  if (!isStr(f.value)) fail("Fact", "value required");
  if (!inRange(f.confidence, 0, 1)) fail("Fact", `confidence out of [0,1]: ${f.confidence}`);
  if (!isStr(f.source)) fail("Fact", "source required (provenance)");
  if (!isNum(f.ts)) fail("Fact", "ts must be a number");
}
