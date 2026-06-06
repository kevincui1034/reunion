"use client";

import type { ActionState } from "@/lib/trace/types";
import { StageChip } from "./StageDot";

function Card({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border bg-ink-900/40 p-4 transition-all duration-500 ${
        active
          ? "border-white/15 shadow-[0_0_0_1px_rgba(255,106,61,0.18),0_18px_60px_-30px_rgba(255,106,61,0.45)]"
          : "border-white/[0.06] opacity-60"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
          {label}
        </span>
        {active && (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ember">
            live
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const STATUS_COLOR = {
  in: "text-cool",
  tentative: "text-ember",
  out: "text-ink-400 line-through",
  pending: "text-ink-300",
} as const;

const STATUS_GLYPH = {
  in: "●",
  tentative: "◐",
  out: "○",
  pending: "·",
} as const;

export function ActionPanel({ state }: { state: ActionState }) {
  const reached = (s: ActionState["stage"]) => {
    const order: ActionState["stage"][] = ["idle", "intent", "calendar", "itinerary", "done"];
    return order.indexOf(state.stage) >= order.indexOf(s);
  };

  return (
    <section className="flex h-full min-h-[560px] flex-col gap-4 rounded-xl border border-white/[0.06] bg-gradient-to-b from-ink-900/60 to-ink-950/60 p-5 backdrop-blur">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-200">
            action
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {(["intent", "calendar", "itinerary"] as const).map((s) => (
            <StageChip key={s} stage={s} active={state.stage === s} />
          ))}
        </div>
      </header>

      <Card label="01 · group chat" active={reached("intent")}>
        {state.chatName ? (
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="font-display text-2xl leading-none text-ink-100">
                {state.chatName}
              </div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-400">
                signal: travel intent · reunion
              </div>
            </div>
            {state.destination && (
              <div className="text-right">
                <div className="font-display text-2xl italic leading-none text-ember">
                  {state.destination}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">
                  destination
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-400">
            Awaiting first signal from the group chat.
          </p>
        )}
      </Card>

      <Card label="02 · roster × calendars" active={reached("calendar")}>
        {state.roster ? (
          <div>
            <ul className="grid grid-cols-3 gap-x-3 gap-y-1.5 sm:grid-cols-3">
              {state.roster.map((m) => (
                <li
                  key={m.name}
                  className={`flex items-center gap-1.5 font-mono text-[12px] ${STATUS_COLOR[m.status]}`}
                >
                  <span className="w-3 text-center text-[10px]">{STATUS_GLYPH[m.status]}</span>
                  <span className="lowercase">{m.name}</span>
                </li>
              ))}
            </ul>
            {state.weekend && (
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">
                  proposed window
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-[13px]">
                  <div>
                    <div className="text-ink-400 text-[10px] uppercase tracking-[0.14em]">
                      arrive
                    </div>
                    <div className="text-ink-100">{state.weekend.start}</div>
                  </div>
                  <div>
                    <div className="text-ink-400 text-[10px] uppercase tracking-[0.14em]">
                      depart
                    </div>
                    <div className="text-ink-100">{state.weekend.end}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-400">
            Roster will resolve from chat membership.
          </p>
        )}
      </Card>

      <Card label="03 · itinerary draft" active={reached("itinerary")}>
        {state.itinerary ? (
          <ol className="space-y-3">
            {state.itinerary.map((d) => (
              <li key={d.day}>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ember">
                  {d.day}
                </div>
                <ul className="mt-1.5 space-y-1">
                  {d.items.map((it) => (
                    <li key={it.time} className="flex items-baseline gap-3 text-[13px]">
                      <span className="w-16 shrink-0 font-mono text-[11px] text-ink-400">
                        {it.time}
                      </span>
                      <span className="text-ink-100">{it.what}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-400">
            The draft assembles itself from group rituals + new options.
          </p>
        )}
      </Card>
    </section>
  );
}
