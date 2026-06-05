import type { TraceStage } from "@/lib/trace/types";

const STAGE_LABEL: Record<TraceStage, string> = {
  intent: "intent",
  calendar: "calendar",
  itinerary: "itinerary",
};

const STAGE_COLOR: Record<TraceStage, string> = {
  intent: "bg-ember text-ink-950",
  calendar: "bg-cool text-ink-950",
  itinerary: "bg-ink-100 text-ink-950",
};

export function StageChip({ stage, active = false }: { stage: TraceStage; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${STAGE_COLOR[stage]} ${
        active ? "" : "opacity-90"
      }`}
    >
      {active && <span className="block h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" />}
      {STAGE_LABEL[stage]}
    </span>
  );
}
