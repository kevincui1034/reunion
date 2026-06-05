/**
 * Central config + tool client wiring. The scaffold runs entirely on in-memory
 * stubs (USE_STUBS=true). Each owner flips their layer to the real SDK here as it
 * lands, without touching the pipeline.
 */
import { InMemoryXTrace, type MemoryStore } from "./memory/xtrace.js";
import { InMemoryButterbase, type StateStore } from "./state/butterbase.js";
import { ButterbaseStore } from "./state/butterbaseStore.js";
import { butterbaseFromEnv } from "./state/butterbaseClient.js";

export interface Clients {
  memory: MemoryStore; // XTrace
  state: StateStore; // Butterbase
}

export function createClients(): Clients {
  // State: real Butterbase when configured AND not forced to stubs; else in-memory.
  const bb = process.env.USE_STUBS === "false" ? butterbaseFromEnv() : null;
  const state: StateStore = bb ? new ButterbaseStore(bb) : new InMemoryButterbase();
  // TODO(team): swap InMemoryXTrace for the real XTrace client when its SDK lands.
  return {
    memory: new InMemoryXTrace(),
    state,
  };
}

// RocketRide pipeline connection, read from env. Present only when at least a URI
// or API key is configured — otherwise the pipeline runs on the heuristic stub.
const rocketrideAuth = process.env.ROCKETRIDE_APIKEY ?? process.env.ROCKETRIDE_AUTH;
const rocketride =
  process.env.ROCKETRIDE_URI || rocketrideAuth
    ? {
        uri: process.env.ROCKETRIDE_URI,
        auth: rocketrideAuth,
        pipelinePath: process.env.ROCKETRIDE_PIPELINE ?? "./pipelines/extract-trip-signal.json",
      }
    : undefined;

export const config = {
  useStubs: process.env.USE_STUBS !== "false",
  channel: (process.env.CHANNEL ?? "iMessage") as "iMessage" | "telegram",
  rocketride,
};
