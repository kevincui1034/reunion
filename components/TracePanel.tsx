"use client";

import { useEffect, useRef } from "react";
import type { TraceEvent } from "@/lib/trace/types";
import { StageChip } from "./StageDot";

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function Row({ ev, index }: { ev: TraceEvent; index: number }) {
  return (
    <div
      className="animate-trace-in grid grid-cols-[56px_1fr] gap-3 border-b border-white/[0.04] py-3 pl-4 pr-3 last:border-b-0"
      style={{ animationDelay: `${Math.min(index, 6) * 18}ms` }}
    >
      <div className="select-none pt-0.5 font-mono text-[10px] leading-tight text-ink-400">
        <div>{fmtTime(ev.at)}</div>
        <div className="mt-0.5 text-ink-500">#{String(index + 1).padStart(2, "0")}</div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StageChip stage={ev.stage} />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">
            {ev.kind.replace(/_/g, " ")}
          </span>
          {typeof ev.confidence === "number" && (
            <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-ink-300">
              <span className="block h-1 w-10 rounded-full bg-white/[0.08]">
                <span
                  className="block h-full rounded-full bg-ember"
                  style={{ width: `${Math.round(ev.confidence * 100)}%` }}
                />
              </span>
              {Math.round(ev.confidence * 100)}%
            </span>
          )}
        </div>

        <div className="mt-1.5 text-[15px] leading-snug text-ink-100">{ev.label}</div>

        {ev.thought && (
          <div className="mt-1 flex gap-2 text-[13px] leading-relaxed text-ink-300">
            <span aria-hidden className="mt-2 block h-px w-3 shrink-0 bg-ink-500" />
            <span className="italic">{ev.thought}</span>
          </div>
        )}

        {ev.detail && (
          <div className="mt-2 overflow-hidden rounded-md border border-white/[0.05] bg-white/[0.02]">
            <table className="w-full font-mono text-[11px]">
              <tbody>
                {Object.entries(ev.detail).map(([k, v]) => (
                  <tr key={k} className="border-b border-white/[0.04] last:border-b-0">
                    <td className="w-32 border-r border-white/[0.04] px-2.5 py-1.5 align-top text-ink-400">
                      {k}
                    </td>
                    <td className="px-2.5 py-1.5 text-ink-200">
                      {Array.isArray(v) ? v.join(", ") : String(v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function TracePanel({
  events,
  status,
}: {
  events: TraceEvent[];
  status: "idle" | "streaming" | "done";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  return (
    <section className="relative flex h-full min-h-[560px] flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/60 backdrop-blur">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-2 w-2">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${
                status === "streaming"
                  ? "animate-pulse-dot bg-ember"
                  : status === "done"
                  ? "bg-cool"
                  : "bg-ink-500"
              }`}
            />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-200">
            trace · model of thought
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </header>

      <div ref={scrollRef} className="trace-scroll hairline-grid relative flex-1 overflow-y-auto">
        {events.length === 0 && (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="max-w-xs">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400">
                idle
              </div>
              <p className="mt-2 text-sm text-ink-300">
                Connect a group chat to start the trace. Nothing is observed until you do.
              </p>
            </div>
          </div>
        )}
        {events.map((e, i) => (
          <Row key={e.id} ev={e} index={i} />
        ))}
        {status === "streaming" && (
          <div className="flex items-center gap-2 px-4 py-3 font-mono text-[11px] text-ink-400">
            <span className="block h-1 w-24 rounded-full shimmer-line animate-shimmer" />
            <span>thinking</span>
            <span className="animate-caret">▍</span>
          </div>
        )}
      </div>
    </section>
  );
}
