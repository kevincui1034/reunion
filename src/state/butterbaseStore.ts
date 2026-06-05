/**
 * Butterbase-backed StateStore — the real system of record.
 *
 * Implements the same `StateStore` seam as `InMemoryButterbase`, so the pipeline
 * is unchanged: flip to this when BUTTERBASE_* is configured (see config.ts).
 * Maps our camelCase contract types ↔ snake_case Butterbase rows.
 */
import type { ButterbaseClient } from "@butterbase/sdk";
import type { Trip, TripParticipant, PollSpec } from "../contracts/index.js";
import type { StateStore, StoredPoll } from "./butterbase.js";

interface TripRow {
  id: string;
  group_id: string;
  destination: string;
  timeframe: string | null;
  status: string;
  current_summary: string;
  created_at: number;
  updated_at: number;
}

function rowToTrip(r: TripRow): Trip {
  return {
    id: r.id,
    groupId: r.group_id,
    destination: r.destination,
    timeframe: r.timeframe,
    status: r.status as Trip["status"],
    currentSummary: r.current_summary,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

// Loosely typed against the SDK's builders (Insert/Update/Select all expose execute()).
async function run<T>(q: { execute: () => Promise<{ data?: unknown; error?: unknown }> }): Promise<T> {
  const { data, error } = await q.execute();
  if (error) throw new Error(`Butterbase error: ${JSON.stringify(error)}`);
  return data as T;
}

export class ButterbaseStore implements StateStore {
  private seq = 0;
  constructor(
    private bb: ButterbaseClient,
    private now: () => number = () => Date.now(),
  ) {}

  private id(prefix: string): string {
    return `${prefix}_${this.now().toString(36)}_${(++this.seq).toString(36)}`;
  }

  async createTrip(input: Omit<Trip, "id" | "createdAt" | "updatedAt">): Promise<Trip> {
    const t = this.now();
    const row: TripRow = {
      id: this.id("trip"),
      group_id: input.groupId,
      destination: input.destination,
      timeframe: input.timeframe,
      status: input.status,
      current_summary: input.currentSummary,
      created_at: t,
      updated_at: t,
    };
    await run(this.bb.from<TripRow>("trips").insert(row));
    return rowToTrip(row);
  }

  async getTrip(id: string): Promise<Trip | undefined> {
    const rows = await run<TripRow[]>(this.bb.from<TripRow>("trips").select("*").eq("id", id));
    return rows?.[0] ? rowToTrip(rows[0]) : undefined;
  }

  async updateTrip(
    id: string,
    patch: Partial<Pick<Trip, "destination" | "timeframe" | "status" | "currentSummary">>,
  ): Promise<Trip> {
    const set: Record<string, unknown> = { updated_at: this.now() };
    if (patch.destination !== undefined) set.destination = patch.destination;
    if (patch.timeframe !== undefined) set.timeframe = patch.timeframe;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.currentSummary !== undefined) set.current_summary = patch.currentSummary;
    await run(this.bb.from<TripRow>("trips").update(set).eq("id", id));
    const fresh = await this.getTrip(id);
    if (!fresh) throw new Error(`Trip not found: ${id}`);
    return fresh;
  }

  async findTripByGroup(groupId: string): Promise<Trip | undefined> {
    const rows = await run<TripRow[]>(
      this.bb.from<TripRow>("trips").select("*").eq("group_id", groupId),
    );
    const active = (rows ?? []).filter((r) => r.status !== "planned");
    return active[0] ? rowToTrip(active[0]) : undefined;
  }

  async upsertParticipant(p: TripParticipant): Promise<TripParticipant> {
    const key = `${p.tripId}:${p.userId}`;
    const row = {
      id: key,
      trip_id: p.tripId,
      user_id: p.userId,
      availability: p.availability ?? null,
      budget_preference: p.budgetPreference ?? null,
      dietary_preferences: p.dietaryPreferences ? JSON.stringify(p.dietaryPreferences) : null,
      notes: p.notes ?? null,
    };
    const existing = await run<unknown[]>(
      this.bb.from("trip_participants").select("id").eq("id", key),
    );
    if (existing?.length) {
      await run(this.bb.from("trip_participants").update(row).eq("id", key));
    } else {
      await run(this.bb.from("trip_participants").insert(row));
    }
    return p;
  }

  async listParticipants(tripId: string): Promise<TripParticipant[]> {
    const rows = await run<Array<Record<string, unknown>>>(
      this.bb.from("trip_participants").select("*").eq("trip_id", tripId),
    );
    return (rows ?? []).map((r) => ({
      tripId: String(r.trip_id),
      userId: String(r.user_id),
      availability: (r.availability as string) ?? undefined,
      budgetPreference: (r.budget_preference as string) ?? undefined,
      dietaryPreferences: r.dietary_preferences
        ? (JSON.parse(String(r.dietary_preferences)) as string[])
        : undefined,
      notes: (r.notes as string) ?? undefined,
    }));
  }

  async createPoll(tripId: string, spec: PollSpec): Promise<StoredPoll> {
    const poll: StoredPoll = {
      ...spec,
      id: this.id("poll"),
      tripId,
      status: "open",
      votes: {},
    };
    await run(
      this.bb.from("polls").insert({
        id: poll.id,
        trip_id: tripId,
        question: spec.question,
        choices: JSON.stringify(spec.choices),
        status: poll.status,
        votes: JSON.stringify(poll.votes),
      }),
    );
    return poll;
  }
}
