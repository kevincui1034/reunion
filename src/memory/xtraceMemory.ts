/**
 * XTrace-backed MemoryStore — real durable memory with belief revision.
 *
 * XTrace's model is message-ingest + recall (it derives and revises beliefs
 * internally), not structured Fact writes. This adapter maps our `MemoryStore`
 * seam onto it: `write` ingests a fact as a one-line message; `current`/`history`
 * recall via semantic search. Belief revision happens inside XTrace when a
 * contradicting message is ingested.
 *
 * The `@xtraceai/memory` package is loaded lazily via a dynamic import so the
 * scaffold typechecks and `npm run demo` works even when it isn't installed.
 * Requires XTRACE_API_KEY (xtk_…) and XTRACE_ORG_ID.
 */
import type { Fact } from "../contracts/index.js";
import type { MemoryStore } from "./xtrace.js";

// Minimal shape of the bits of MemoryClient we use (avoids a hard dep at typecheck).
interface XTraceClientLike {
  memories: {
    ingest(
      input: { messages: { role: string; content: string }[]; user_id: string; conv_id: string },
      opts?: { wait?: boolean },
    ): Promise<unknown>;
    search(input: { query: string; user_id: string }): Promise<{ data?: Array<{ id: string; text: string }> }>;
  };
}

const XTRACE_MODULE = "@xtraceai/memory";

export class XTraceMemory implements MemoryStore {
  private clientP?: Promise<XTraceClientLike>;
  private seq = 0;

  constructor(
    private readonly apiKey: string,
    private readonly orgId: string,
    private readonly defaultConv = "reunion-demo",
  ) {}

  private client(): Promise<XTraceClientLike> {
    if (!this.clientP) {
      this.clientP = import(XTRACE_MODULE).then(
        (m: any) => new m.MemoryClient({ apiKey: this.apiKey, orgId: this.orgId }) as XTraceClientLike,
      );
    }
    return this.clientP;
  }

  async write(input: Omit<Fact, "id" | "superseded">): Promise<Fact> {
    const client = await this.client();
    // Ingest the fact as a natural-language message; XTrace revises beliefs itself.
    await client.memories.ingest(
      {
        messages: [{ role: "user", content: `${input.predicate}: ${input.value}` }],
        user_id: input.subjectId,
        conv_id: input.source || this.defaultConv,
      },
      { wait: true },
    );
    return { ...input, id: `xt_${++this.seq}`, superseded: false };
  }

  async current(subjectId: string, predicate?: string): Promise<Fact[]> {
    const client = await this.client();
    const res = await client.memories.search({
      query: predicate ?? "preferences, constraints and availability",
      user_id: subjectId,
    });
    return (res.data ?? []).map((r) => ({
      id: r.id,
      subjectId,
      subjectKind: "user" as const,
      predicate: predicate ?? "memory",
      value: r.text,
      confidence: 1,
      source: "xtrace",
      ts: 0,
      superseded: false,
    }));
  }

  // XTrace returns current beliefs (already revised); history mirrors current here.
  async history(subjectId: string, predicate?: string): Promise<Fact[]> {
    return this.current(subjectId, predicate);
  }
}

/** Construct from env, or null when XTrace isn't fully configured. */
export function xtraceFromEnv(): XTraceMemory | null {
  const apiKey = process.env.XTRACE_API_KEY;
  const orgId = process.env.XTRACE_ORG_ID;
  if (!apiKey || !orgId) return null;
  return new XTraceMemory(apiKey, orgId);
}
