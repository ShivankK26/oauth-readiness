"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DIFFICULTY } from "@/lib/format";
import type { Difficulty } from "@/lib/schema";

export type GuideSummary = {
  slug: string;
  name: string;
  website: string;
  category: string;
  oneLiner: string;
  difficulty: Difficulty;
  activeEffort: string;
  approvalWait: string;
  reviewRequired: string;
};

const norm = (s: string) => s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").trim();

export function AppSearch({ guides }: { guides: GuideSummary[] }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const nq = norm(q);
  const matches = nq
    ? guides.filter((g) => norm(g.name).includes(nq) || norm(g.website).includes(nq) || nq.includes(norm(g.name)) || g.slug === nq)
    : guides;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nq) return;
    const exact = guides.find((g) => norm(g.name) === nq || g.slug === nq || norm(g.website).split("/")[0] === nq.split("/")[0]);
    router.push(exact ? `/apps/${exact.slug}` : `/generate?app=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search an app or paste its website, e.g. Gmail, linear.app, Zoom…"
          className="h-12 flex-1 rounded-lg border border-zinc-300 bg-white px-4 text-base outline-none ring-zinc-900/10 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button className="h-12 rounded-lg bg-zinc-900 px-5 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900">
          {nq && matches.length === 0 ? "Generate guide" : "Go"}
        </button>
      </form>

      {nq && matches.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm dark:border-zinc-700">
          <span className="font-medium">&ldquo;{q}&rdquo; isn&apos;t in the library yet.</span> An agent can research it now: it reads the provider&apos;s docs, probes their OAuth endpoints and writes a guide. Takes about 1–3 minutes.{" "}
          <Link href={`/generate?app=${encodeURIComponent(q.trim())}`} className="font-medium underline">Generate a guide for {q} →</Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {matches.map((g) => (
          <Link key={g.slug} href={`/apps/${g.slug}`} className="group rounded-xl border border-zinc-200 p-4 transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-600">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{g.name}</div>
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${DIFFICULTY[g.difficulty].className}`}>{DIFFICULTY[g.difficulty].label}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{g.oneLiner}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span><span className="font-medium text-zinc-700 dark:text-zinc-300">Effort</span> {g.activeEffort}</span>
              <span><span className="font-medium text-zinc-700 dark:text-zinc-300">Wait</span> {g.approvalWait}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
