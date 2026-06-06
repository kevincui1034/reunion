/**
 * Calendar availability client — Kevin's shipped HTTP endpoint.  [Owner: Jossue]
 *
 * Kevin's calendar component runs as a deployed service. We POST a `trip_id` and it
 * fills `trip_participants.availability` server-side and returns the intersection of
 * free time across resolved participants (`common_free`) plus a connect link for any
 * participant who hasn't linked Google Calendar yet.
 *
 * Contract (from the handoff):
 *   POST {baseUrl}/api/trip-availability  { trip_id }
 *   headers: { content-type, x-internal-key }
 *   → { common_free: Range[], participants: [{ handle, status, connect_url? }] }
 *
 * The endpoint is idempotent — retrying the same trip_id is safe.
 *
 * `fetch` is injected so this is unit-testable without the live service. The parse is
 * deliberately tolerant: `common_free` ranges may arrive as epoch ms or ISO strings,
 * and the connect link may sit on the participant or inside its `availability` JSON
 * (both forms appear in Kevin's doc). Exact units are confirmed via `calendar-probe.ts`.
 */
import { normalizeRangeBound } from "./intervals.js";
import type { PendingConnect } from "../../contracts/index.js";

export interface FreeRange {
  start: number; // epoch ms
  end: number; // epoch ms
}

export interface ResolvedParticipant {
  handle: string;
  status: "resolved" | "needs_connect_link";
  connectUrl?: string;
}

export interface CalendarAvailability {
  commonFree: FreeRange[];
  participants: ResolvedParticipant[];
  /** Convenience: participants needing a connect link, shaped for the channel layer. */
  pendingConnects: PendingConnect[];
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface CalendarClientConfig {
  baseUrl: string;
  internalKey: string;
  fetchImpl?: FetchLike;
}

export class CalendarClient {
  private readonly baseUrl: string;
  private readonly internalKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(cfg: CalendarClientConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, "");
    this.internalKey = cfg.internalKey;
    this.fetchImpl = cfg.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    if (!this.fetchImpl) throw new Error("CalendarClient: no fetch implementation available");
  }

  async getAvailability(tripId: string): Promise<CalendarAvailability> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/trip-availability`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-key": this.internalKey,
      },
      body: JSON.stringify({ trip_id: tripId }),
    });
    if (!res.ok) {
      const detail = await safeText(res);
      throw new Error(`calendar endpoint ${res.status}: ${detail}`);
    }
    return parseAvailability(await res.json());
  }
}

/** Coerce the endpoint's JSON into our normalized shape. Exported for unit tests. */
export function parseAvailability(raw: unknown): CalendarAvailability {
  if (!isObject(raw)) throw new Error("calendar response is not an object");

  const commonFree = parseRanges(raw.common_free ?? raw.commonFree);
  const rawParticipants = Array.isArray(raw.participants) ? raw.participants : [];

  const participants: ResolvedParticipant[] = rawParticipants
    .filter(isObject)
    .map((p) => {
      const handle = typeof p.handle === "string" ? p.handle : String(p.handle ?? "");
      const { status, connectUrl } = resolveStatus(p);
      return { handle, status, connectUrl };
    })
    .filter((p) => p.handle);

  const pendingConnects: PendingConnect[] = participants
    .filter((p) => p.status === "needs_connect_link" && p.connectUrl)
    .map((p) => ({ handle: p.handle, connectUrl: p.connectUrl! }));

  return { commonFree, participants, pendingConnects };
}

/** A participant's connect status may be top-level or inside the `availability` JSON. */
function resolveStatus(p: Record<string, unknown>): {
  status: ResolvedParticipant["status"];
  connectUrl?: string;
} {
  // 1. Top-level form: { status, connect_url }.
  let status = typeof p.status === "string" ? p.status : undefined;
  let connectUrl = pickConnectUrl(p);

  // 2. Nested form: availability is a JSON string holding { status, connect_url }.
  const avail = parseMaybeJson(p.availability);
  if (isObject(avail)) {
    status = status ?? (typeof avail.status === "string" ? avail.status : undefined);
    connectUrl = connectUrl ?? pickConnectUrl(avail);
  }

  return {
    status: status === "needs_connect_link" || connectUrl ? "needs_connect_link" : "resolved",
    connectUrl,
  };
}

function pickConnectUrl(o: Record<string, unknown>): string | undefined {
  const v = o.connect_url ?? o.connectUrl;
  return typeof v === "string" && v ? v : undefined;
}

function parseRanges(raw: unknown): FreeRange[] {
  if (!Array.isArray(raw)) return [];
  const out: FreeRange[] = [];
  for (const r of raw) {
    if (!isObject(r)) continue;
    const start = normalizeRangeBound(r.start);
    const end = normalizeRangeBound(r.end);
    if (start !== null && end !== null && end > start) out.push({ start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

function parseMaybeJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function safeText(res: { text(): Promise<string> }): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "(no body)";
  }
}
