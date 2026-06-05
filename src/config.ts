/**
 * Central config + tool client wiring. The scaffold runs entirely on in-memory
 * stubs (USE_STUBS=true). Each owner flips their layer to the real SDK here as it
 * lands, without touching the pipeline.
 */
import { InMemoryXTrace, type MemoryStore } from "./memory/xtrace.js";
import { InMemoryButterbase, type StateStore } from "./state/butterbase.js";

export interface Clients {
  memory: MemoryStore; // XTrace
  state: StateStore; // Butterbase
}

export function createClients(): Clients {
  // TODO(team): when USE_STUBS=false, construct the real XTrace/Butterbase clients.
  return {
    memory: new InMemoryXTrace(),
    state: new InMemoryButterbase(),
  };
}

export const config = {
  useStubs: process.env.USE_STUBS !== "false",
  channel: (process.env.CHANNEL ?? "iMessage") as "iMessage" | "telegram",
};
