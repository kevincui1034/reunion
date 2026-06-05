/**
 * RocketRide-backed entity extraction → TripSignal.  [Owner: Pablo + Jossue]
 *
 * The real RocketRide step: it renders the sliding message window as text, runs
 * it through a RocketRide pipeline (built on the visual canvas, exported to a
 * `.json`/`.pipe` file pointed at by ROCKETRIDE_PIPELINE), and coerces the
 * pipeline's output into a `TripSignal`.
 *
 * Two invariants from the contract / PRD:
 *  - **Never hallucinate** (FR2): missing fields become null/[]; only participants
 *    are defaulted, and only from observed window senders (not invented).
 *  - **Recoverable on partial failure** (PRD §13/§20): ANY engine/parse error
 *    degrades to the heuristic `extract()` instead of throwing. The demo never
 *    dies because the pipeline blipped.
 *
 * The SDK client is injected (`clientFactory`) so this is unit-testable without a
 * live engine; `createRocketRideExtract` wires the real `rocketride` SDK.
 */
import type {
  IncomingMessage,
  TripSignal,
  TripPath,
  ParticipantRef,
  Constraint,
  Preference,
} from "../contracts/index.js";

/** The subset of the `rocketride` SDK's RocketRideClient we depend on. */
export interface RocketRideLike {
  connect(): Promise<unknown>;
  use(opts: { filepath?: string }): Promise<{ token: string }>;
  send(
    token: string,
    data: string,
    objinfo?: Record<string, unknown>,
    mimetype?: string,
  ): Promise<unknown>;
  terminate(token: string): Promise<void>;
  disconnect(): Promise<void>;
}

type NameOf = (senderId: string) => string;
type HeuristicExtract = (window: IncomingMessage[], nameOf: NameOf) => TripSignal;

export interface RocketRideExtractorDeps {
  clientFactory: () => RocketRideLike | Promise<RocketRideLike>;
  pipelinePath: string;
  fallback: HeuristicExtract;
  /** Max ms for the whole RocketRide round-trip before degrading. */
  timeoutMs?: number;
}

const TRIP_PATHS: TripPath[] = ["destination-known", "time-known", "open-ended"];

/** Reject after `ms` so an unreachable engine degrades fast instead of hanging. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`rocketride timeout after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export class RocketRideExtractor {
  constructor(private readonly deps: RocketRideExtractorDeps) {}

  async extract(window: IncomingMessage[], nameOf: NameOf): Promise<TripSignal> {
    const participants = observedParticipants(window, nameOf);
    // env override lets the demo tune the degrade timeout without code changes.
    const ms = this.deps.timeoutMs ?? (Number(process.env.ROCKETRIDE_TIMEOUT_MS) || 8000);
    const ref: { client?: RocketRideLike } = {};
    try {
      // Race the whole round-trip against a timeout — connect() can hang forever
      // against a dead engine, which the try/catch alone would never recover from.
      return await withTimeout(this.run(window, nameOf, participants, ref), ms);
    } catch {
      // Graceful degradation — the heuristic always produces a valid TripSignal.
      return this.deps.fallback(window, nameOf);
    } finally {
      if (ref.client) {
        try {
          await ref.client.disconnect();
        } catch {
          /* best-effort cleanup */
        }
      }
    }
  }

  private async run(
    window: IncomingMessage[],
    nameOf: NameOf,
    participants: ParticipantRef[],
    ref: { client?: RocketRideLike },
  ): Promise<TripSignal> {
    ref.client = await this.deps.clientFactory();
    await ref.client.connect();
    const { token } = await ref.client.use({ filepath: this.deps.pipelinePath });
    const raw = await ref.client.send(
      token,
      renderWindow(window, nameOf),
      { name: "conversation.txt" },
      "text/plain",
    );
    await ref.client.terminate(token);
    return coerceTripSignal(raw, { participants });
  }
}

/** Render the sliding window as the plain-text transcript the pipeline sees. */
export function renderWindow(window: IncomingMessage[], nameOf: NameOf): string {
  return window.map((m) => `${nameOf(m.senderId)}: ${m.text}`).join("\n");
}

function observedParticipants(window: IncomingMessage[], nameOf: NameOf): ParticipantRef[] {
  const seen = new Map<string, ParticipantRef>();
  for (const m of window) {
    if (!seen.has(m.senderId)) {
      seen.set(m.senderId, { userId: m.senderId, displayName: nameOf(m.senderId) });
    }
  }
  return [...seen.values()];
}

/**
 * Coerce an arbitrary pipeline result into a valid `TripSignal`.
 * Accepts a TripSignal-ish object, a JSON string, or a `{ result }` envelope.
 * Throws on unusable input so the caller can fall back to the heuristic.
 */
export function coerceTripSignal(
  raw: unknown,
  defaults: { participants: ParticipantRef[] },
): TripSignal {
  const o = unwrap(raw);

  const destination = typeof o.destination === "string" && o.destination.trim() ? o.destination : null;
  const timeframe = typeof o.timeframe === "string" && o.timeframe.trim() ? o.timeframe : null;
  const path: TripPath = TRIP_PATHS.includes(o.path as TripPath)
    ? (o.path as TripPath)
    : destination
      ? "destination-known"
      : "open-ended";

  const participants = isArray<ParticipantRef>(o.participants) ? o.participants : defaults.participants;
  const constraints = isArray<Constraint>(o.constraints) ? o.constraints : [];
  const preferences = isArray<Preference>(o.preferences) ? o.preferences : [];
  const openQuestions = isArray<string>(o.openQuestions) ? o.openQuestions : [];
  const confidence =
    typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1
      ? o.confidence
      : destination
        ? 0.8
        : 0.4;

  return { path, destination, timeframe, participants, constraints, preferences, openQuestions, confidence };
}

function unwrap(raw: unknown): Record<string, unknown> {
  let value = raw;
  if (typeof value === "string") {
    value = JSON.parse(value); // throws on non-JSON → caller falls back
  }
  if (!isPlainObject(value)) {
    throw new Error("pipeline result is not an object");
  }
  if ("result" in value && isPlainObject((value as Record<string, unknown>).result)) {
    return (value as Record<string, unknown>).result as Record<string, unknown>;
  }
  if ("result" in value && typeof (value as Record<string, unknown>).result === "string") {
    return unwrap((value as Record<string, unknown>).result);
  }
  return value as Record<string, unknown>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isArray<T>(v: unknown): v is T[] {
  return Array.isArray(v);
}

// Module name held in a variable so the optional `rocketride` dependency is not
// statically resolved — typecheck and `npm run demo` work even when it's absent.
const ROCKETRIDE_MODULE = "rocketride";

export interface RocketRideConnectConfig {
  uri?: string;
  auth?: string;
  pipelinePath: string;
}

export type Extract = (window: IncomingMessage[], nameOf: NameOf) => Promise<TripSignal>;

export interface ExtractConfig {
  useStubs: boolean;
  rocketride?: { uri?: string; auth?: string; pipelinePath: string };
}

/**
 * Choose the extraction implementation from config — the single switch that flips
 * the pipeline from the heuristic stub to the real RocketRide step. Mirrors the
 * `USE_STUBS` gate used for XTrace/Butterbase in `config.ts`.
 */
export function resolveExtract(cfg: ExtractConfig, fallback: HeuristicExtract): Extract {
  if (!cfg.useStubs && cfg.rocketride) {
    return createRocketRideExtract(cfg.rocketride, fallback);
  }
  return async (window, nameOf) => fallback(window, nameOf);
}

/**
 * Wire the real `rocketride` SDK behind the same `(window, nameOf) => TripSignal`
 * seam the heuristic uses. Falls back to `fallback` on any failure.
 */
export function createRocketRideExtract(
  config: RocketRideConnectConfig,
  fallback: HeuristicExtract,
): (window: IncomingMessage[], nameOf: NameOf) => Promise<TripSignal> {
  const extractor = new RocketRideExtractor({
    pipelinePath: config.pipelinePath,
    fallback,
    clientFactory: async () => {
      const mod: any = await import(ROCKETRIDE_MODULE);
      return new mod.RocketRideClient({ uri: config.uri, auth: config.auth }) as RocketRideLike;
    },
  });
  return (window, nameOf) => extractor.extract(window, nameOf);
}
