import type { TraceEvent } from "./types";

/**
 * The scripted demo. Each step's `delay` is the pause AFTER emission
 * before the next event fires — tuned for readability, not realism.
 */
export interface ScriptStep {
  delay: number;
  event: Omit<TraceEvent, "id" | "at">;
}

export const DEMO_SCRIPT: ScriptStep[] = [
  // ── Stage 1: intent ──────────────────────────────────────────────────────
  {
    delay: 700,
    event: {
      stage: "intent",
      kind: "message_observed",
      label: "New message in “Tahoe crew”",
      thought: "Routing to intent classifier — looks like a plan-making message.",
      detail: {
        from: "maya",
        text: "ok but seriously, we need to do tahoe again this fall 🍂",
      },
    },
  },
  {
    delay: 900,
    event: {
      stage: "intent",
      kind: "thought",
      label: "Reading prior 14 days of chat for context",
      thought:
        "Three earlier mentions of “fall trip,” one reference to “last year’s cabin.” Establishing this is a continuation, not a one-off.",
    },
  },
  {
    delay: 1100,
    event: {
      stage: "intent",
      kind: "intent_detected",
      label: "Travel intent: REUNION",
      thought:
        "Destination signal: “tahoe.” Seasonal anchor: “this fall.” Continuity: prior reunion at this location. Confidence high.",
      detail: {
        destination: "Lake Tahoe, CA",
        season: "Fall 2026",
        kind: "reunion",
      },
      confidence: 0.92,
    },
  },
  {
    delay: 800,
    event: {
      stage: "intent",
      kind: "roster_resolved",
      label: "Resolved roster: 6 participants",
      thought:
        "Pulled from chat membership + last year's trip attendees. Two members weren't in last year's roster — flagging as new joiners.",
      detail: {
        members: ["maya", "jordan", "sam", "priya", "alex", "devin"],
      },
    },
  },

  // ── Stage 2: calendar ────────────────────────────────────────────────────
  {
    delay: 1000,
    event: {
      stage: "calendar",
      kind: "calendar_query",
      label: "Cross-checking calendars · Sep – Nov 2026",
      thought:
        "Querying connected calendars (Google × 4, iCloud × 2). Looking for contiguous 3-day windows where ≥5 of 6 are free.",
    },
  },
  {
    delay: 1100,
    event: {
      stage: "calendar",
      kind: "calendar_conflict",
      label: "Conflict cluster found · Oct 9–12",
      thought:
        "Jordan has a wedding Oct 10. Devin is traveling for work that week. Dropping this window.",
      detail: {
        window: "Oct 9 – Oct 12",
        blockers: ["jordan: wedding", "devin: SF → NYC"],
      },
    },
  },
  {
    delay: 1100,
    event: {
      stage: "calendar",
      kind: "slot_proposed",
      label: "Candidate window · Oct 23–26",
      thought:
        "5 of 6 fully clear. Priya has a half-day Friday — proposing arrival shifted to Friday evening to accommodate.",
      detail: {
        arrival: "Fri Oct 23, 6:00 PM PT",
        depart: "Mon Oct 26, 11:00 AM PT",
        coverage: "6 / 6",
      },
      confidence: 0.88,
    },
  },
  {
    delay: 900,
    event: {
      stage: "calendar",
      kind: "slot_locked",
      label: "Window locked pending confirms",
      thought:
        "Drafting a soft-hold poll for the chat — committing nothing until majority confirms.",
    },
  },

  // ── Stage 3: itinerary ───────────────────────────────────────────────────
  {
    delay: 1000,
    event: {
      stage: "itinerary",
      kind: "venue_search",
      label: "Searching lodging · 6 ppl, lake access, dog-friendly",
      thought:
        "Pulling from prior preferences: cabin > hotel, hot tub mentioned twice in chat, Devin's dog needs to come.",
    },
  },
  {
    delay: 1200,
    event: {
      stage: "itinerary",
      kind: "itinerary_drafted",
      label: "Itinerary drafted · 3 nights, North Lake Tahoe",
      thought:
        "Anchoring on group rituals from last year (lake-day Saturday, breakfast at Fire Sign) and slotting two new options around them.",
      detail: {
        lodging: "Carnelian Bay cabin · 3BR · hot tub",
        ritual_anchors: ["Sat lake day", "Sun Fire Sign brunch"],
        new_options: ["Fri sunset paddle", "Sun afternoon Truckee stroll"],
      },
      confidence: 0.81,
    },
  },
  {
    delay: 600,
    event: {
      stage: "itinerary",
      kind: "handoff",
      label: "Ready to send · awaiting your sign-off",
      thought:
        "Posting the draft + poll into “Tahoe crew” once you confirm. Nothing leaves Reunion without your okay.",
    },
  },
];
