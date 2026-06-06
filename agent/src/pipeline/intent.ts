/**
 * RocketRide step: signal-strength classification.  [Owner: Pablo]
 *
 * The heavier, cloud-side classification that runs only on messages the on-device
 * gate let through (two-stage model, CLAUDE.md). STUB: derives strength from the
 * extracted signal; Pablo replaces with the real RocketRide classifier.
 */
import type { IntentSignal, TripSignal } from "../contracts/index.js";

export function classifySignalStrength(signal: TripSignal): {
  signal: IntentSignal;
  confidence: number;
} {
  if (signal.destination && (signal.constraints.length || signal.timeframe)) {
    return { signal: "active", confidence: signal.confidence };
  }
  if (signal.destination) return { signal: "weak", confidence: signal.confidence };
  return { signal: "none", confidence: signal.confidence };
}
