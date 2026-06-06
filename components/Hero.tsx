export function Hero() {
  return (
    <header className="relative z-10 pt-16 pb-10 sm:pt-20 sm:pb-14">
      <div className="flex items-center gap-2">
        <span className="block h-2 w-2 rounded-full bg-ember animate-pulse-dot" />
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-300">
          Reunion · intent tracer
        </span>
      </div>

      <h1 className="mt-6 max-w-4xl font-display text-[44px] leading-[1.02] tracking-tight text-ink-100 sm:text-[64px]">
        Watch a group chat&apos;s{" "}
        <span className="italic text-ember">intent to reunite</span>{" "}
        become a weekend you actually take.
      </h1>

      <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-ink-300 sm:text-[17px]">
        Reunion listens for the signal — &ldquo;we should do this again&rdquo; — then quietly does
        the math: cross-checks six calendars, finds the one weekend that works, and drafts an
        itinerary built around your group&apos;s rituals. The trace below shows the model of
        thought as it happens.
      </p>
    </header>
  );
}
