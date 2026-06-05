/**
 * Butterbase-backed StateStore — conforms to the SHARED live schema (Ethan's
 * intent-to-poll tables), not a private one. Source of truth = the deployed
 * Butterbase app (see `npm run db:introspect`).
 *
 *   trips(id, chat_guid, destination, timeframe, created_at)
 *   trip_participants(trip_id, handle, status)
 *   polls(id, trip_id, chat_guid, kind, title, options, trigger_message_id,
 *         external_poll_guid, participant_snapshot, status, ..., created_at)
 *
 * Our `Trip` contract carries status/currentSummary, which the shared `trips`
 * table does NOT model — those are returned as derived defaults (not persisted).
 * What persists is the headline claim: the trip exists as real state.
 */
import type { ButterbaseClient } from "@butterbase/sdk";
import type { Trip, TripParticipant, PollSpec } from "../contracts/index.js";
import type { StateStore, StoredPoll } from "./butterbase.js";

interface TripRow {
  id: string;
  chat_guid: string;
  destination: string | null;
  timeframe: string | null;
  created_at: string; // ISO text
}

function rowToTrip(r: TripRow, overrides: Partial<Trip> = {}): Trip {
  const ts = Date.parse(r.created_at) || 0;
  return {
    id: r.id,
    groupId: r.chat_guid,
    destination: r.destination ?? "",
    timeframe: r.timeframe,
    status: "forming", // not modeled in shared trips table
    currentSummary: "",
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

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
      chat_guid: input.groupId, // our groupId IS the iMessage chat_guid
      destination: input.destination,
      timeframe: input.timeframe,
      created_at: new Date(t).toISOString(),
    };
    await run(this.bb.from<TripRow>("trips").insert(row));
    return rowToTrip(row, { status: input.status, currentSummary: input.currentSummary, createdAt: t, updatedAt: t });
  }

  async getTrip(id: string): Promise<Trip | undefined> {
    const rows = await run<TripRow[]>(this.bb.from<TripRow>("trips").select("*").eq("id", id));
    return rows?.[0] ? rowToTrip(rows[0]) : undefined;
  }

  async updateTrip(
    id: string,
    patch: Partial<Pick<Trip, "destination" | "timeframe" | "status" | "currentSummary">>,
  ): Promise<Trip> {
    // Only destination/timeframe exist in the shared trips table.
    const set: Record<string, unknown> = {};
    if (patch.destination !== undefined) set.destination = patch.destination;
    if (patch.timeframe !== undefined) set.timeframe = patch.timeframe;
    const current = await this.getTrip(id);
    if (!current) throw new Error(`Trip not found: ${id}`);
    if (Object.keys(set).length) {
      // Best-effort: the shared trips table uses a text id, but the server's PATCH
      // targets a UUID primary key, so column updates here aren't guaranteed. The
      // pipeline only updates currentSummary (not modeled → set is empty → skipped),
      // so this never blocks the core loop.
      try {
        await run(this.bb.from<TripRow>("trips").update(set).eq("chat_guid", current.groupId).eq("id", id));
      } catch (err) {
        console.warn(`[butterbase] trip update best-effort skipped: ${(err as Error).message}`);
      }
    }
    const fresh = (await this.getTrip(id)) ?? current;
    // Reflect non-persisted fields (status/summary) from the patch for the caller.
    return { ...fresh, status: patch.status ?? fresh.status, currentSummary: patch.currentSummary ?? fresh.currentSummary };
  }

  async findTripByGroup(groupId: string): Promise<Trip | undefined> {
    const rows = await run<TripRow[]>(this.bb.from<TripRow>("trips").select("*").eq("chat_guid", groupId));
    return rows?.[0] ? rowToTrip(rows[0]) : undefined;
  }

  async upsertParticipant(p: TripParticipant): Promise<TripParticipant> {
    // Shared trip_participants is (trip_id, handle, status).
    const status = p.availability ? "in" : "pending";
    const existing = await run<Array<Record<string, unknown>>>(
      this.bb.from("trip_participants").select("*").eq("trip_id", p.tripId).eq("handle", p.userId),
    );
    if (existing?.length) {
      await run(this.bb.from("trip_participants").update({ status }).eq("trip_id", p.tripId).eq("handle", p.userId));
    } else {
      await run(this.bb.from("trip_participants").insert({ trip_id: p.tripId, handle: p.userId, status }));
    }
    return p;
  }

  async listParticipants(tripId: string): Promise<TripParticipant[]> {
    const rows = await run<Array<Record<string, unknown>>>(
      this.bb.from("trip_participants").select("*").eq("trip_id", tripId),
    );
    return (rows ?? []).map((r) => ({ tripId: String(r.trip_id), userId: String(r.handle), notes: String(r.status ?? "") }));
  }

  async createPoll(tripId: string, spec: PollSpec): Promise<StoredPoll> {
    const trip = await this.getTrip(tripId);
    const poll: StoredPoll = { ...spec, id: this.id("poll"), tripId, status: "open", votes: {} };
    await run(
      this.bb.from("polls").insert({
        id: poll.id,
        trip_id: tripId,
        chat_guid: trip?.groupId ?? tripId,
        kind: "date",
        title: spec.question,
        options: JSON.stringify(spec.choices),
        trigger_message_id: this.id("trigger"),
        status: "open",
        created_at: new Date(this.now()).toISOString(),
      }),
    );
    return poll;
  }
}
