import { createMockTraceSource } from "./mockSource";
import type { TraceEventSource } from "./types";

/**
 * Factory. Today returns the scripted mock; flip NEXT_PUBLIC_TRACE_MODE=live
 * once the Butterbase SSE route + `butterbaseSource.ts` are in place.
 *
 * See docs/landing-butterbase-plan.md for the wiring plan.
 */
export function getTraceSource(): TraceEventSource {
  const mode = process.env.NEXT_PUBLIC_TRACE_MODE;
  if (mode === "live") {
    // TODO: return createButterbaseTraceSource()
    if (typeof console !== "undefined") {
      console.warn("NEXT_PUBLIC_TRACE_MODE=live but butterbaseSource not implemented; falling back to mock.");
    }
  }
  return createMockTraceSource();
}

/**
 * Derive the right-hand action panel state from accumulated events.
 * Pure — easy to test.
 */
import type { ActionState, TraceEvent } from "./types";

export function deriveActionState(events: TraceEvent[]): ActionState {
  const state: ActionState = { stage: events.length ? events[events.length - 1].stage : "idle" };

  for (const e of events) {
    if (e.kind === "intent_detected" && e.detail) {
      state.destination = String(e.detail.destination ?? "");
      state.chatName = "Tahoe crew";
    }
    if (e.kind === "roster_resolved" && e.detail) {
      const members = (e.detail.members as string[]) ?? [];
      state.roster = members.map((name) => ({ name, status: "pending" as const }));
    }
    if (e.kind === "slot_proposed" && e.detail) {
      state.weekend = {
        start: String(e.detail.arrival ?? ""),
        end: String(e.detail.depart ?? ""),
      };
    }
    if (e.kind === "slot_locked" && state.roster) {
      // Demo: most say yes, one tentative.
      state.roster = state.roster.map((m, i) => ({
        ...m,
        status: i === 3 ? "tentative" : "in",
      }));
    }
    if (e.kind === "itinerary_drafted") {
      state.itinerary = [
        {
          day: "Fri · Oct 23",
          items: [
            { time: "6:00 PM", what: "Arrive · Carnelian Bay cabin" },
            { time: "8:00 PM", what: "Sunset paddle (new this year)" },
          ],
        },
        {
          day: "Sat · Oct 24",
          items: [
            { time: "9:30 AM", what: "Fire Sign Café · the ritual" },
            { time: "12:00 PM", what: "Lake day · Sand Harbor" },
            { time: "8:00 PM", what: "Cabin dinner + hot tub" },
          ],
        },
        {
          day: "Sun · Oct 25",
          items: [
            { time: "10:00 AM", what: "Truckee stroll" },
            { time: "2:00 PM", what: "Hike · Eagle Falls" },
          ],
        },
      ];
    }
    if (e.kind === "handoff") {
      state.stage = "done";
    }
  }

  return state;
}
