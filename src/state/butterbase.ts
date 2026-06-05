/**
 * Butterbase — backend state (system of record).
 *
 * Boundary (ADR-005/017): the current truth for application entities — trips,
 * participants, polls, options. It does NOT reason about belief revision (that's
 * XTrace). `StateStore` is the seam; `InMemoryButterbase` is a working stub.
 */
import type {
  Trip,
  TripParticipant,
  TripStatus,
  PollSpec,
} from "../contracts/index.js";

export interface StoredPoll extends PollSpec {
  id: string;
  tripId: string;
  status: "open" | "closed";
  votes: Record<string, string[]>; // choiceId → userIds
}

export interface StateStore {
  createTrip(
    input: Omit<Trip, "id" | "createdAt" | "updatedAt">,
  ): Promise<Trip>;
  getTrip(id: string): Promise<Trip | undefined>;
  updateTrip(
    id: string,
    patch: Partial<Pick<Trip, "destination" | "timeframe" | "status" | "currentSummary">>,
  ): Promise<Trip>;
  findTripByGroup(groupId: string): Promise<Trip | undefined>;
  upsertParticipant(p: TripParticipant): Promise<TripParticipant>;
  listParticipants(tripId: string): Promise<TripParticipant[]>;
  createPoll(tripId: string, spec: PollSpec): Promise<StoredPoll>;
}

export class InMemoryButterbase implements StateStore {
  private trips = new Map<string, Trip>();
  private participants = new Map<string, TripParticipant>(); // key: tripId:userId
  private polls = new Map<string, StoredPoll>();
  private seq = 0;
  private now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  async createTrip(
    input: Omit<Trip, "id" | "createdAt" | "updatedAt">,
  ): Promise<Trip> {
    const t = this.now();
    const trip: Trip = { ...input, id: `trip_${++this.seq}`, createdAt: t, updatedAt: t };
    this.trips.set(trip.id, trip);
    return trip;
  }

  async getTrip(id: string): Promise<Trip | undefined> {
    return this.trips.get(id);
  }

  async updateTrip(
    id: string,
    patch: Partial<Pick<Trip, "destination" | "timeframe" | "status" | "currentSummary">>,
  ): Promise<Trip> {
    const trip = this.trips.get(id);
    if (!trip) throw new Error(`Trip not found: ${id}`);
    const updated: Trip = { ...trip, ...patch, updatedAt: this.now() };
    this.trips.set(id, updated);
    return updated;
  }

  async findTripByGroup(groupId: string): Promise<Trip | undefined> {
    // The group's active trip, regardless of status — matches the real
    // ButterbaseStore (which returns the trip row for a chat_guid). A planned trip
    // stays the system of record: later messages UPDATE it (the plan is a living
    // artifact) rather than spawning a fresh trip per message.
    let latest: Trip | undefined;
    for (const trip of this.trips.values()) {
      if (trip.groupId === groupId && (!latest || trip.updatedAt >= latest.updatedAt)) {
        latest = trip;
      }
    }
    return latest;
  }

  async upsertParticipant(p: TripParticipant): Promise<TripParticipant> {
    this.participants.set(`${p.tripId}:${p.userId}`, p);
    return p;
  }

  async listParticipants(tripId: string): Promise<TripParticipant[]> {
    return [...this.participants.values()].filter((p) => p.tripId === tripId);
  }

  async createPoll(tripId: string, spec: PollSpec): Promise<StoredPoll> {
    const poll: StoredPoll = {
      ...spec,
      id: `poll_${++this.seq}`,
      tripId,
      status: "open",
      votes: {},
    };
    this.polls.set(poll.id, poll);
    return poll;
  }
}

// Re-export for convenience.
export type { TripStatus };
