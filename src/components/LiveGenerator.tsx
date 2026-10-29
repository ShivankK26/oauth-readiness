"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AgentEvent, StepEvent, StoredStep } from "@/lib/agent";
import type { Guide } from "@/lib/schema";
import { encodeGuide } from "@/lib/format";
import { GuideView } from "./GuideView";

type LogItem = Exclude<AgentEvent, { type: "note" | "guide" }>;

const ICON: Record<LogItem["type"], string> = { status: "●", search: "⌕", fetch: "↓", probe: "⚡", error: "✕" };

export function LiveGenerator() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("app") ?? "";
  const [app, setApp] = useState(initial);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogItem[]>([]);
  const [notes, setNotes] = useState("");
  const [guide, setGuide] = useState<Guide | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(false);
  const abort = useRef<AbortController | null>(null);

  /** Applies one streamed event. Returns the step's outcome once its final event arrives. */
  function apply(e: StepEvent): { next?: string; done?: boolean } | null {
    if (e.type === "step") return null;
    if (e.type === "next") return { next: e.state };
    if (e.type === "note") setNotes((n) => n + e.text);
    else if (e.type === "guide") {
      setGuide(e.guide);
      return { done: true };
    } else {
      setLog((l) => [...l, e]);
      if (e.type === "error") return { done: true };
    }
    return null;
  }

  /**
   * Runs one step and returns its outcome. If the stream drops after the step started, the server still
   * finishes it and saves the result, so poll for that and replay the events this client missed.
   */
  async function runStepRequest(body: { app?: string; state?: string }, signal: AbortSignal) {
    const res = await fetch("/api/generate", { method: "POST", body: JSON.stringify(body), signal });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      setLog((l) => [...l, { type: "error", message: err.error ?? "Request failed" }]);
      return { done: true };
    }
    let stepId = "";
    let received = 0; // non-note events applied, to know which saved events were missed
    try {
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as StepEvent;
          if (e.type === "step") stepId = e.id;
          if (e.type !== "note") received++;
          const outcome = apply(e);
          if (outcome) return outcome;
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError" || !stepId) throw err;
    }
    // A dropped connection can also end cleanly, so reaching here means the result never arrived.
    if (!stepId) throw new Error("The connection closed before the step finished.");
    setLog((l) => [...l, { type: "status", message: "Connection dropped; waiting for this step to finish on the server…" }]);
    for (let waited = 0; waited < 300; waited += 4) {
      await new Promise((r) => setTimeout(r, 4000));
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const poll = await fetch(`/api/generate?step=${stepId}`, { signal, cache: "no-store" }).catch(() => null);
      if (!poll || poll.status === 202) continue;
      if (!poll.ok) break;
      const saved = (await poll.json()) as StoredStep;
      let outcome: { next?: string; done?: boolean } | null = null;
      for (const e of saved.events.slice(received)) outcome = apply(e) ?? outcome;
      if (outcome) return outcome;
      break;
    }
    throw new Error("The connection closed before the step finished.");
  }

  async function run(name: string) {
    if (!name.trim()) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRunning(true);
    setLog([]);
    setNotes("");
    setGuide(null);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      // A run is a series of short step requests: each streams its events and ends with the signed
      // state for the next step, the guide, or an error. A step whose connection drops is retried once.
      let body: { app?: string; state?: string } = { app: name };
      for (let step = 0, retried = false; step < 20; step++) {
        let end: { next?: string; done?: boolean } = {};
        try {
          end = await runStepRequest(body, ctrl.signal);
        } catch (err) {
          if ((err as Error).name === "AbortError" || retried) throw err;
          retried = true;
          setLog((l) => [...l, { type: "status", message: "Connection dropped, retrying this step…" }]);
          step--;
          continue;
        }
        retried = false;
        if (end.done || !end.next) return;
        body = { state: end.next };
      }
      throw new Error("Too many steps; try again.");
    } catch (err) {
      if ((err as Error).name !== "AbortError") setLog((l) => [...l, { type: "error", message: (err as Error).message }]);
    } finally {
      clearInterval(timer);
      setRunning(false);
    }
  }

  useEffect(() => {
    if (initial && !started.current) {
      started.current = true;
      run(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareUrl = guide && typeof window !== "undefined" ? `${window.location.origin}/g#${encodeGuide(guide)}` : undefined;

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Generate a guide for any app</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          An agent searches the provider&apos;s docs, reads the relevant pages, probes their OAuth endpoints, then writes a guide with every claim labelled by evidence. Usually 2–4 minutes.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.replace(`/generate?app=${encodeURIComponent(app.trim())}`);
          run(app);
        }}
        className="flex gap-2"
      >
        <input value={app} onChange={(e) => setApp(e.target.value)} placeholder="App name or website, e.g. Calendly, airtable.com" className="h-12 flex-1 rounded-lg border border-zinc-300 bg-white px-4 outline-none ring-zinc-900/10 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900" />
        <button disabled={running || !app.trim()} className="h-12 rounded-lg bg-zinc-900 px-5 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900">
          {running ? "Researching…" : "Generate"}
        </button>
      </form>

      {(running || log.length > 0) && !guide && (
        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold">
              <span>Agent activity</span>
              <span className="font-mono text-xs text-zinc-500">{elapsed}s</span>
            </div>
            <ul className="max-h-[420px] space-y-1.5 overflow-y-auto font-mono text-xs">
              {log.map((e, i) => (
                <li key={i} className={`flex gap-2 ${e.type === "error" ? "text-rose-600" : ""}`}>
                  <span className="w-3 shrink-0 text-zinc-400">{ICON[e.type]}</span>
                  <span className="break-all">
                    {e.type === "status" && e.message}
                    {e.type === "error" && e.message}
                    {e.type === "search" && <>search: <span className="text-zinc-500">{e.query}</span></>}
                    {e.type === "fetch" && <>read: <span className="text-zinc-500">{e.url}</span></>}
                    {e.type === "probe" && <>probe: <span className="text-zinc-500">{e.url}</span> → <span className="text-emerald-700 dark:text-emerald-400">{e.result.split("\n")[0]}</span></>}
                  </span>
                </li>
              ))}
              {running && <li className="animate-pulse text-zinc-400">…</li>}
            </ul>
          </div>
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 text-sm font-semibold">Research notes</div>
            <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{notes || "Waiting for first findings…"}</div>
          </div>
        </div>
      )}

      {guide && (
        <div className="space-y-4">
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
            Generated live in {elapsed}s by an agent from {guide.sources.length} sources. The share link stores the whole guide in the URL, so anyone with it sees exactly this version. Live guides aren&apos;t human-reviewed: check the <a href="#evidence" className="underline">uncertain items</a> before you rely on them.
          </div>
          <GuideView guide={guide} shareUrl={shareUrl} />
        </div>
      )}
    </div>
  );
}
