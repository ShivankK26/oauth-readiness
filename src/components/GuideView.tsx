"use client";

import { useEffect, useState } from "react";
import type { Guide, Evidence as EvidenceT, Owner as OwnerT } from "@/lib/schema";
import { DIFFICULTY, EVIDENCE, OWNER, evidenceCounts, guideToMarkdown } from "@/lib/format";

function Chip({ className, children, title }: { className: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

function Cite({ g, evidence, ids }: { g: Guide; evidence: EvidenceT; ids: string[] }) {
  const e = EVIDENCE[evidence];
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      <Chip className={e.className} title={e.hint}>{e.label}</Chip>
      {ids.map((id) => {
        const s = g.sources.find((x) => x.id === id);
        return (
          <a key={id} href={s?.url} target="_blank" rel="noreferrer" title={s?.title} className="text-[11px] text-zinc-500 underline decoration-dotted hover:text-zinc-900 dark:hover:text-zinc-100">
            [{id}]
          </a>
        );
      })}
    </span>
  );
}

function OwnerChip({ owner }: { owner: OwnerT }) {
  return <Chip className={OWNER[owner].className}>{OWNER[owner].label}</Chip>;
}

function Section({ id, title, children, note }: { id: string; title: string; children: React.ReactNode; note?: string }) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {note && <span className="text-xs text-zinc-500">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-semibold leading-snug">{value}</div>
    </div>
  );
}

export function GuideView({ guide: g, shareUrl }: { guide: Guide; shareUrl?: string }) {
  const storageKey = `progress:${g.slug}:${g.meta.reviewedAt}`;
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(storageKey) ?? "{}"));
    } catch {}
  }, [storageKey]);

  const toggle = (key: string) => {
    const next = { ...done, [key]: !done[key] };
    setDone(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };

  const copy = async (kind: "link" | "md") => {
    const url = shareUrl ?? window.location.href;
    await navigator.clipboard.writeText(kind === "link" ? url : guideToMarkdown(g, url));
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  };

  const v = g.verdict;
  const counts = evidenceCounts(g);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const allSteps = g.phases.flatMap((p, pi) => p.steps.map((_, si) => `${pi}.${si}`));
  const completed = allSteps.filter((k) => done[k]).length;

  return (
    <article className="space-y-10">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>{g.category}</span>
          <span>·</span>
          <a href={g.website.startsWith("http") ? g.website : `https://${g.website}`} target="_blank" rel="noreferrer" className="hover:underline">
            {g.website.replace(/^https?:\/\//, "")}
          </a>
          <span>·</span>
          <span>{g.meta.origin === "live" ? "Generated live by agent" : "Curated"} · reviewed {g.meta.reviewedAt}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight">{g.name}</h1>
            <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">{g.oneLiner}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => copy("link")} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              {copied === "link" ? "Copied!" : "Copy share link"}
            </button>
            <button onClick={() => copy("md")} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              {copied === "md" ? "Copied!" : "Copy as Markdown"}
            </button>
          </div>
        </div>
      </header>

      {/* Verdict */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-md px-2.5 py-1 text-sm font-semibold ring-1 ring-inset ${DIFFICULTY[v.difficulty].className}`}>{DIFFICULTY[v.difficulty].label}</span>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Review {v.reviewRequired === "none" ? "not required" : v.reviewRequired === "always" ? "always required" : "required when"}
            {v.reviewRequired !== "none" && <>: {v.reviewTrigger}</>}
          </span>
          <Cite g={g} evidence={v.evidence} ids={v.sourceIds} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Hands-on effort" value={v.activeEffort} />
          <Stat label="Approval wait" value={v.approvalWait} />
          <Stat label="First test connection" value={v.timeToFirstConnection} />
          <Stat label="External users" value={v.timeToProduction} />
        </div>
        <p className="mt-4 text-sm"><span className="font-medium">Cost:</span> <span className="text-zinc-600 dark:text-zinc-400">{v.cost}</span></p>
        <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
          <span className="font-semibold">Fastest path today: </span>
          {g.fastPath}
        </div>
        {/* Evidence mix */}
        <div className="mt-4">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            {(Object.keys(counts) as EvidenceT[]).map((k) => (
              <div key={k} style={{ width: `${(counts[k] / total) * 100}%` }} className={{ tested: "bg-emerald-500", documented: "bg-sky-500", reported: "bg-amber-500", inferred: "bg-zinc-400" }[k]} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-zinc-500">
            {(Object.keys(counts) as EvidenceT[]).map((k) => (
              <span key={k} title={EVIDENCE[k].hint}>{counts[k]} {EVIDENCE[k].label.toLowerCase()}</span>
            ))}
            <a href="/method" className="underline decoration-dotted">what these mean</a>
          </div>
        </div>
      </div>

      {/* Agent vs you */}
      <Section id="handoff" title="What an agent can do vs. where you take over">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-500/30 dark:bg-violet-500/5">
            <div className="mb-2 text-sm font-semibold text-violet-800 dark:text-violet-300">An agent can</div>
            <ul className="space-y-1.5 text-sm">{g.agentHandoff.agentCan.map((x, i) => <li key={i} className="flex gap-2"><span className="text-violet-500">→</span>{x}</li>)}</ul>
          </div>
          <div className="rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
            <div className="mb-2 text-sm font-semibold">You must</div>
            <ul className="space-y-1.5 text-sm">{g.agentHandoff.humanMust.map((x, i) => <li key={i} className="flex gap-2"><span>●</span>{x}</li>)}</ul>
          </div>
        </div>
      </Section>

      {/* Steps */}
      <Section id="steps" title="Step by step" note={`${completed}/${allSteps.length} done · progress saved in this browser`}>
        <ol className="space-y-6">
          {g.phases.map((p, pi) => (
            <li key={pi} className="relative">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-white dark:text-zinc-900">{pi + 1}</span>
                <h3 className="font-semibold">{p.title}</h3>
                <span className={`text-xs ${p.isWait ? "rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "text-zinc-500"}`}>
                  {p.isWait ? "⏳ " : ""}{p.duration}
                </span>
              </div>
              <ul className="ml-3 space-y-2 border-l border-zinc-200 pl-6 dark:border-zinc-800">
                {p.steps.map((s, si) => {
                  const key = `${pi}.${si}`;
                  return (
                    <li key={si} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="checkbox" checked={!!done[key]} onChange={() => toggle(key)} className="mt-1 h-4 w-4 accent-zinc-900" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-medium ${done[key] ? "text-zinc-400 line-through" : ""}`}>{s.title}</span>
                            <OwnerChip owner={s.owner} />
                            <Cite g={g} evidence={s.evidence} ids={s.sourceIds} />
                          </div>
                          <p className="mt-1 whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">{s.detail}</p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </Section>

      {/* Requirements */}
      <Section id="requirements" title="Requirements & nuances">
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {g.requirements.map((r, i) => (
            <li key={i} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.item}</span>
                {r.blocking && <Chip className="bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300">Blocking</Chip>}
                <Cite g={g} evidence={r.evidence} ids={r.sourceIds} />
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{r.detail}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* Scopes */}
      <Section id="scopes" title="Scopes an agent typically needs">
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr><th className="p-2.5">Scope</th><th className="p-2.5">Purpose</th><th className="p-2.5">Tier</th><th className="p-2.5">Review?</th><th className="p-2.5">Evidence</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {g.scopes.map((s, i) => (
                <tr key={i} className="align-top">
                  <td className="p-2.5"><code className="break-all rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">{s.scope}</code></td>
                  <td className="p-2.5 text-zinc-600 dark:text-zinc-400">{s.purpose}</td>
                  <td className="p-2.5">{s.tier}</td>
                  <td className="p-2.5">{s.triggersReview ? <span className="font-medium text-rose-600 dark:text-rose-400">Yes</span> : "No"}</td>
                  <td className="p-2.5"><Cite g={g} evidence={s.evidence} ids={s.sourceIds} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Blockers */}
      <Section id="blockers" title="If you get stuck">
        <div className="space-y-3">
          {g.blockers.map((b, i) => (
            <details key={i} className="group rounded-lg border border-zinc-200 p-3 open:bg-zinc-50 dark:border-zinc-800 dark:open:bg-zinc-900">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 font-medium">
                <span className="text-zinc-400 transition group-open:rotate-90">▸</span>
                {b.blocker}
                <Cite g={g} evidence={b.evidence} ids={b.sourceIds} />
              </summary>
              <div className="mt-2 space-y-1 pl-5 text-sm">
                <p><span className="font-medium">You&apos;ll see:</span> <span className="text-zinc-600 dark:text-zinc-400">{b.symptom}</span></p>
                <p><span className="font-medium">What to do:</span> <span className="text-zinc-600 dark:text-zinc-400">{b.resolution}</span></p>
              </div>
            </details>
          ))}
        </div>
      </Section>

      {/* Technical */}
      <Section id="technical" title="Technical reference">
        <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <dl className="grid gap-x-6 gap-y-2 md:grid-cols-[160px_1fr]">
            {[
              ["Developer console", g.technical.consoleUrl],
              ["Authorize URL", g.technical.authorizeUrl],
              ["Token URL", g.technical.tokenUrl],
              ["PKCE", g.technical.pkce],
              ["Tokens & refresh", g.technical.refreshTokens],
              ["Redirect URIs", g.technical.redirectUriRules],
            ].map(([k, val]) => (
              <div key={k} className="contents">
                <dt className="font-medium text-zinc-500">{k}</dt>
                <dd className="break-words">{/^https?:\/\//.test(val) ? <a href={val} target="_blank" rel="noreferrer" className="underline decoration-dotted"><code className="text-xs">{val}</code></a> : val}</dd>
              </div>
            ))}
          </dl>
          {g.technical.gotchas.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 font-medium">Gotchas</div>
              <ul className="list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-400">{g.technical.gotchas.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          <div className="mt-3"><Cite g={g} evidence={g.technical.evidence} ids={g.technical.sourceIds} /></div>
        </div>
      </Section>

      {/* Evidence */}
      <Section id="evidence" title="What we verified, and what we couldn't">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-2 text-sm font-semibold">Checked hands-on</div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">{g.meta.verificationNotes.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-500/30 dark:bg-amber-500/5">
            <div className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-300">Uncertain. Confirm before relying on it</div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">{g.uncertainties.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        </div>
        <ol className="mt-4 space-y-1 text-sm">
          {g.sources.map((s) => (
            <li key={s.id} className="flex gap-2">
              <span className="w-8 shrink-0 text-zinc-400">{s.id}</span>
              <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted">{s.title}</a>
              <span className="text-xs text-zinc-400">{s.kind.replace("_", " ")}</span>
            </li>
          ))}
        </ol>
      </Section>
    </article>
  );
}
