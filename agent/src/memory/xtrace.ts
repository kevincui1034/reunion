/**
 * XTrace — durable memory (beliefs). "What is true NOW?"
 *
 * Boundary (ADR-005/017): this stores evolving BELIEFS about people/groups and
 * revises them. It is NOT the system of record for trips/polls — that's Butterbase.
 *
 * `MemoryStore` is the seam. `InMemoryXTrace` is a working stub for the demo and
 * for parallel development; swap in the real XTrace SDK behind the same interface.
 */
import type { Fact } from "../contracts/index.js";

export interface MemoryStore {
  /** Write a fact. If `supersedes` is set, the old fact is marked superseded.
   *  Otherwise, an existing current fact with the same subject+predicate is
   *  auto-superseded (belief revision). Returns the stored fact. */
  write(fact: Omit<Fact, "id" | "superseded">): Promise<Fact>;
  /** Current (non-superseded) facts for a subject, optionally by predicate. */
  current(subjectId: string, predicate?: string): Promise<Fact[]>;
  /** Full history including superseded facts (for the "memory moment" demo). */
  history(subjectId: string, predicate?: string): Promise<Fact[]>;
}

export class InMemoryXTrace implements MemoryStore {
  private facts: Fact[] = [];
  private seq = 0;

  async write(input: Omit<Fact, "id" | "superseded">): Promise<Fact> {
    // Belief revision: supersede any current fact for the same subject+predicate.
    for (const f of this.facts) {
      if (
        !f.superseded &&
        f.subjectId === input.subjectId &&
        f.predicate === input.predicate
      ) {
        f.superseded = true;
      }
    }
    const fact: Fact = { ...input, id: `fact_${++this.seq}`, superseded: false };
    this.facts.push(fact);
    return fact;
  }

  async current(subjectId: string, predicate?: string): Promise<Fact[]> {
    return this.facts.filter(
      (f) =>
        !f.superseded &&
        f.subjectId === subjectId &&
        (predicate === undefined || f.predicate === predicate),
    );
  }

  async history(subjectId: string, predicate?: string): Promise<Fact[]> {
    return this.facts.filter(
      (f) =>
        f.subjectId === subjectId &&
        (predicate === undefined || f.predicate === predicate),
    );
  }
}
