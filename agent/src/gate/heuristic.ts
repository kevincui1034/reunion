/**
 * On-device intent gate — heuristic v0.  [Owner: Pablo]
 *
 * The cheap "is this worth waking the pipeline?" filter at the top of the Spectrum
 * loop. Operates on a SLIDING WINDOW of recent messages (intent emerges across
 * turns), not a single message. This ships first so the demo always "has a local
 * gate"; the ONNX model (gate/onnx.ts) slots in behind the same `classify` seam.
 */
import type { IncomingMessage, IntentVerdict, IntentSignal } from "../contracts/index.js";

// Explicit commands always wake the pipeline.
const COMMANDS = [
  "plan this",
  "what do we know",
  "what's next",
  "whats next",
  "make a poll",
  "summarize the trip",
];

// Strong travel-planning phrasing.
const ACTIVE_PATTERNS = [
  /\bwe should (go|travel|visit)\b/i,
  /\blet'?s (go|travel|plan)\b/i,
  /\bi'?m down\b/i,
  /\b(can only do|only free|free that)\b/i,
  /\b(flights?|airbnb|hotel|lodging)\b/i,
];

// Weak signals — a place or travel noun mentioned without commitment.
const WEAK_PATTERNS = [
  /\b(trip|vacation|getaway|weekend away)\b/i,
  /\b(beach|mountains|city)\b/i,
];

export interface GateOptions {
  /** how many recent messages form the window */
  windowSize?: number;
}

export function classify(
  window: IncomingMessage[],
  opts: GateOptions = {},
): IntentVerdict {
  const size = opts.windowSize ?? 5;
  const recent = window.slice(-size);
  const rank = { none: 0, weak: 1, active: 2, command: 3 } as const;

  // Per-message classification (no closure mutation — keeps TS narrowing happy).
  const hits: Array<{ signal: IntentSignal; id: string }> = [];
  for (const m of recent) {
    const text = m.text.toLowerCase();
    let signal: IntentSignal = "none";
    if (COMMANDS.some((c) => text.includes(c))) signal = "command";
    else if (ACTIVE_PATTERNS.some((re) => re.test(m.text))) signal = "active";
    else if (WEAK_PATTERNS.some((re) => re.test(m.text))) signal = "weak";
    if (signal !== "none") hits.push({ signal, id: m.messageId });
  }

  const triggering = hits.map((h) => h.id);
  const best: IntentSignal = hits.reduce<IntentSignal>(
    (acc, h) => (rank[h.signal] > rank[acc] ? h.signal : acc),
    "none",
  );

  // Wake on a command, or on an active signal, or when ≥2 messages carry weak+ signal.
  const wake =
    best === "command" || best === "active" || (best === "weak" && triggering.length >= 2);

  return {
    wake,
    signal: best,
    triggeringMessageIds: triggering,
    reason: wake
      ? `gate woke on ${best} signal (${triggering.length} cue${triggering.length === 1 ? "" : "s"})`
      : "no travel intent in window",
  };
}
