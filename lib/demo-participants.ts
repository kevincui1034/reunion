/**
 * Hardcoded group for the hackathon demo. Photon is not yet emitting real group
 * rosters into Butterbase; we treat these four as the implicit "group" on every
 * trip until that wiring lands. `phone` is the E.164 `handle` written into
 * `trip_participants.handle`.
 */
export interface DemoParticipant {
  phone: string; // E.164 — also used as trip_participants.handle
  name: string;
}

export const DEMO_PARTICIPANTS: readonly DemoParticipant[] = [
  { phone: '+19085256062', name: 'Pablo' },
  { phone: '+14086671882', name: 'Kevin' },
  { phone: '+15126944844', name: 'Ethan' },
  { phone: '+19732745136', name: 'Jossue' },
];
