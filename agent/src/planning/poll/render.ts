/**
 * Poll rendering + distribution.  [Owner: Ethan]
 *
 * STUB: turns candidate weekends into a PollSpec and a (placeholder) hosted card
 * URL. Real version: persist the poll in Butterbase, host a page with Open Graph
 * metadata so iMessage URL-unfurls it (Local mode — no rich cards), collect votes.
 */
import type { CandidateWeekend, PollSpec } from "../../contracts/index.js";

export function renderDatePoll(candidates: CandidateWeekend[]): PollSpec {
  const top = candidates.slice(0, 3);
  return {
    question: "Which weekend works?",
    choices: top.map((c, i) => ({
      id: `wk_${i}`,
      label: `${c.label} (${c.availableUserIds.length}/${c.availableUserIds.length + c.conflictUserIds.length} free)`,
    })),
  };
}

/** Placeholder for the hosted Butterbase poll page used for URL-unfurl. */
export function pollCardUrl(pollId: string): string {
  const base = process.env.BUTTERBASE_PUBLIC_URL ?? "https://reunion.demo/poll";
  return `${base}/${pollId}`;
}
