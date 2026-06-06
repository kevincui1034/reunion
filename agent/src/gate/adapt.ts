/**
 * Gate seam adapter — bridges Pablo's on-device gate to our pipeline contracts.
 *
 * Pablo's classifier (feature/intent-classification, `src/classifier.ts`) emits:
 *     Verdict { isTravelIntent, confidence, location }
 * Our pipeline consumes the contract types: `IntentVerdict` (the wake decision)
 * and `TripSignal` (the entities). This module is the single point that maps
 * between them, so his gate plugs into our pipeline with no other changes.
 *
 * POST-MERGE: delete the local `GateVerdict` below and instead
 *     import type { Verdict as GateVerdict } from "../classifier.js";
 * Nothing else changes.
 */
import type { IntentVerdict, TripSignal } from "../contracts/index.js";

/** Mirror of Pablo's classifier `Verdict` (kept local until the branches merge). */
export interface GateVerdict {
  isTravelIntent: boolean;
  confidence: number;
  location: string;
}

/** Map the on-device verdict to our gate decision (seam 2: IntentVerdict). */
export function verdictToIntent(v: GateVerdict, triggeringMessageIds: string[] = []): IntentVerdict {
  const signal: IntentVerdict["signal"] = !v.isTravelIntent
    ? "none"
    : v.confidence >= 0.8
      ? "active"
      : "weak";
  return {
    wake: v.isTravelIntent,
    signal,
    triggeringMessageIds,
    reason: v.isTravelIntent
      ? `on-device gate: travel intent ${(v.confidence * 100).toFixed(0)}%`
      : "on-device gate: no travel intent",
  };
}

/**
 * Seed the TripSignal from the verdict. Pablo's sidecar already extracts
 * `location` → we seed `destination` and the path. The pipeline's `extract`
 * step then enriches with constraints/preferences from the message window.
 */
export function verdictToSignalSeed(v: GateVerdict): Pick<TripSignal, "path" | "destination"> {
  const destination = v.location.trim() || null;
  return {
    path: destination ? "destination-known" : "open-ended",
    destination,
  };
}
