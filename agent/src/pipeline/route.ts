/**
 * RocketRide step: path routing.  [Owner: Jossue]
 *
 * V1 only ACTS on the destination-known path (ADR-006/018). The router recognizes
 * the others but returns a "defer" decision for them.
 */
import type { TripSignal, TripPath } from "../contracts/index.js";

export interface RouteDecision {
  path: TripPath;
  act: boolean; // does V1 handle this path end-to-end?
  reason: string;
}

export function route(signal: TripSignal): RouteDecision {
  if (signal.path === "destination-known" && signal.destination) {
    return { path: "destination-known", act: true, reason: `destination known: ${signal.destination}` };
  }
  return {
    path: signal.path,
    act: false,
    reason: `V1 handles destination-known only; "${signal.path}" deferred`,
  };
}
