"use client";

import { useMemo, useRef, useState } from "react";
import { Hero } from "@/components/Hero";
import { TracePanel } from "@/components/TracePanel";
import { ActionPanel } from "@/components/ActionPanel";
import { EmailCapture } from "@/components/EmailCapture";
import { deriveActionState, getTraceSource } from "@/lib/trace/source";
import type { TraceEvent, TraceEventSource } from "@/lib/trace/types";

type Status = "idle" | "streaming" | "done";

export default function Page() {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const sourceRef = useRef<TraceEventSource | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const state = useMemo(() => deriveActionState(events), [events]);

  function start() {
    if (status === "streaming") return;
    if (status === "done") {
      // replay
      setEvents([]);
    }
    setStatus("streaming");
    const src = getTraceSource();
    sourceRef.current = src;
    unsubRef.current = src.subscribe(
      (ev) => setEvents((cur) => [...cur, ev]),
      () => setStatus("done"),
    );
  }

  return (
    <main className="relative z-10 mx-auto max-w-[1280px] px-6 pb-24 sm:px-10">
      <Hero />

      {status === "idle" && (
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <button
            onClick={start}
            className="group relative inline-flex items-center gap-3 rounded-md bg-ember px-5 py-3 text-[14px] font-medium text-ink-950 transition-transform hover:-translate-y-0.5"
          >
            <span className="block h-2 w-2 rounded-full bg-ink-950 group-hover:animate-pulse-dot" />
            Connect to your group chat
            <span className="font-mono text-[11px] opacity-70">↵</span>
          </button>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
            demo trace · no data leaves your browser
          </span>
        </div>
      )}

      {status !== "idle" && (
        <div className="mb-8 flex items-center gap-3">
          <button
            onClick={start}
            disabled={status === "streaming"}
            className="rounded-md border border-white/10 bg-ink-900/60 px-4 py-2 text-[13px] text-ink-200 transition-colors hover:border-white/20 disabled:opacity-40"
          >
            {status === "streaming" ? "tracing…" : "Replay trace"}
          </button>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
            {status === "streaming"
              ? "watching the model think"
              : "trace complete · awaiting your sign-off"}
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <TracePanel events={events} status={status} />
        <ActionPanel state={state} />
      </div>

      {status === "done" && (
        <div className="mt-8 max-w-2xl">
          <EmailCapture />
        </div>
      )}

      <footer className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
        <span>Reunion · group travel, observed not orchestrated</span>
        <span>v0.1 · trace mode: {process.env.NEXT_PUBLIC_TRACE_MODE ?? "mock"}</span>
      </footer>
    </main>
  );
}
