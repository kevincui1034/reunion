"use client";

import { useState } from "react";

export function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("submitting");
    try {
      const r = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "submit failed");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "done") {
    return (
      <div className="animate-trace-in rounded-xl border border-cool/30 bg-cool/[0.05] p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cool">
          on the list
        </div>
        <p className="mt-2 text-[15px] text-ink-100">
          We&apos;ll reach out when Reunion is ready for your group chat.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="animate-trace-in rounded-xl border border-white/10 bg-ink-900/60 p-5 backdrop-blur"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ember">
        you saw the trace · now get on the list
      </div>
      <p className="mt-2 text-[15px] text-ink-200">
        Reunion is rolling out to one group chat at a time. Drop your email and we&apos;ll bring
        yours online.
      </p>
      <div className="mt-4 flex gap-2">
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 rounded-md border border-white/10 bg-ink-950/70 px-3 py-2.5 text-[14px] text-ink-100 outline-none placeholder:text-ink-500 focus:border-ember/60 focus:ring-1 focus:ring-ember/40"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-md bg-ember px-4 py-2.5 text-[13px] font-medium text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === "submitting" ? "…" : "Get on list"}
        </button>
      </div>
      {error && (
        <div className="mt-2 font-mono text-[11px] text-ember">{error}</div>
      )}
    </form>
  );
}
