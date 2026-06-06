/**
 * RocketRide step: next-action generation.  [Owner: Jossue]
 *
 * Turns a PlanResult into the single OutgoingMove posted back into chat. In the
 * destination-known V1 flow the move is the rendered itinerary as PLAIN TEXT (Local
 * mode: no Markdown, no cards — PRD §18/§23). When no bookable window exists yet, we
 * ask the group to widen availability instead.
 */
import type { OutgoingMove } from "../contracts/index.js";
import type { PlanResult } from "./plan.js";

export function nextAction(result: PlanResult, groupId: string): OutgoingMove {
  const { summary, itinerary, nextStep } = result;

  if (nextStep === "itinerary" && itinerary) {
    // The itinerary is already chat-shaped, plain text. Send it as-is.
    return { groupId, text: itinerary };
  }

  if (nextStep === "gather-availability") {
    return {
      groupId,
      text: `${summary}\n\nNo window works for everyone yet — what dates are you free? I'll find one.`,
    };
  }

  return { groupId, text: summary };
}
