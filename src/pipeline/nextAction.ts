/**
 * RocketRide step: next-action generation.  [Owner: Jossue]
 *
 * Turns a PlanResult into the single OutgoingMove posted back into chat. Always
 * "ask before acting" (PRD example): we propose the poll, we don't silently create
 * the trip as final.
 */
import type { OutgoingMove } from "../contracts/index.js";
import type { PlanResult } from "./plan.js";
import { renderDatePoll } from "../planning/poll/render.js";

export function nextAction(result: PlanResult, groupId: string): OutgoingMove {
  const { summary, candidates, nextStep } = result;

  if (nextStep === "confirm-and-poll") {
    const poll = renderDatePoll(candidates);
    return {
      groupId,
      text: `Sounds like a trip is forming. Here's what I have:\n\n${summary}\n\nWant me to start a date poll?`,
      poll,
    };
  }

  if (nextStep === "gather-availability") {
    return {
      groupId,
      text: `${summary}\n\nWhat weekends are you all free? I'll find one that works.`,
    };
  }

  return { groupId, text: summary };
}
