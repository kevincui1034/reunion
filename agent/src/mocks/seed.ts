/**
 * Synthetic demo context (ADR-016) + mocked 12-month calendar (ADR-008).
 * Four friends, an iMessage group, a busy calendar that yields a clean weekend,
 * and the PRD §10 sample conversation. [shared]
 */
import type { IncomingMessage } from "../contracts/index.js";
import type { BusyCalendar } from "../planning/when/availability.js";

export const GROUP_ID = "group_reunion_demo";

export const USERS: Record<string, string> = {
  u_kevin: "Kevin",
  u_ethan: "Ethan",
  u_pablo: "Pablo",
  u_jossue: "Jossue",
};

export function displayName(userId: string): string {
  return USERS[userId] ?? userId;
}

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

/** Busy ranges that leave a couple of weekends fully open for the demo. */
export function mockCalendar(from: number = Date.now()): BusyCalendar {
  return {
    u_kevin: [{ start: from + 1 * WEEK, end: from + 1 * WEEK + 3 * DAY }],
    u_ethan: [{ start: from + 2 * WEEK, end: from + 2 * WEEK + 2 * DAY }],
    u_pablo: [{ start: from + 1 * WEEK, end: from + 1 * WEEK + 1 * DAY }],
    u_jossue: [], // wide open
  };
}

/** PRD §10 demo conversation — note the two decoy messages the gate should ignore. */
export function sampleConversation(baseTs: number = Date.now()): IncomingMessage[] {
  let n = 0;
  const msg = (senderId: string, text: string): IncomingMessage => ({
    channel: "iMessage",
    groupId: GROUP_ID,
    senderId,
    text,
    ts: baseTs + n * 1000,
    messageId: `m_${++n}`,
  });
  return [
    msg("u_ethan", "lol did you see that meme"), // decoy — gate should NOT wake
    msg("u_pablo", "We should go to Mexico City in July"), // active signal
    msg("u_kevin", "I'm down, but I can only do weekends"), // constraint
    msg("u_ethan", "same, and I'm vegetarian so keep that in mind"), // pref
    msg("u_jossue", "Roma Norte looks sick"), // interest
  ];
}
