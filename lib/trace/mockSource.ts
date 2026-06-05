import { DEMO_SCRIPT } from "./script";
import type { TraceEvent, TraceEventSource } from "./types";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export function createMockTraceSource(): TraceEventSource {
  let timers: ReturnType<typeof setTimeout>[] = [];
  let active = false;

  function clear() {
    for (const t of timers) clearTimeout(t);
    timers = [];
  }

  return {
    subscribe(onEvent, onDone) {
      if (active) clear();
      active = true;

      let cursor = 0;
      const start = Date.now();
      let elapsed = 0;

      DEMO_SCRIPT.forEach((step) => {
        elapsed += step.delay;
        const fireAt = elapsed;
        const t = setTimeout(() => {
          const ev: TraceEvent = {
            ...step.event,
            id: genId(),
            at: new Date(start + fireAt).toISOString(),
          };
          onEvent(ev);
          cursor += 1;
          if (cursor === DEMO_SCRIPT.length) {
            active = false;
            onDone?.();
          }
        }, fireAt);
        timers.push(t);
      });

      return () => {
        active = false;
        clear();
      };
    },
    reset() {
      clear();
      active = false;
    },
  };
}
