export type TraceStage = "intent" | "calendar" | "itinerary";

export type TraceEventKind =
  | "message_observed"
  | "thought"
  | "intent_detected"
  | "roster_resolved"
  | "calendar_query"
  | "calendar_conflict"
  | "slot_proposed"
  | "slot_locked"
  | "venue_search"
  | "itinerary_drafted"
  | "handoff";

export interface TraceEvent {
  id: string;
  stage: TraceStage;
  kind: TraceEventKind;
  /** ISO timestamp */
  at: string;
  /** One-line headline rendered as the row title. */
  label: string;
  /** Model-of-thought rationale. Renders as the muted line beneath the label. */
  thought?: string;
  /** Structured payload rendered as a small key/value block. */
  detail?: Record<string, string | number | boolean | string[]>;
  /** Optional confidence (0..1) — shown as a thin meter. */
  confidence?: number;
}

export interface TraceEventSource {
  /** Subscribe to events. Returns an unsubscribe fn. */
  subscribe(onEvent: (e: TraceEvent) => void, onDone?: () => void): () => void;
  /** Optional: stop and reset (used by the "replay" button). */
  reset?(): void;
}

/** What the right-hand action panel renders, derived from accumulated events. */
export interface ActionState {
  stage: TraceStage | "idle" | "done";
  chatName?: string;
  destination?: string;
  weekend?: { start: string; end: string };
  roster?: { name: string; status: "in" | "tentative" | "out" | "pending" }[];
  itinerary?: { day: string; items: { time: string; what: string }[] }[];
}
