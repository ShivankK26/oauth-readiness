import Link from "next/link";
import { EVIDENCE } from "@/lib/format";
import { listGuides } from "@/lib/guides";
import { getVerificationLog } from "@/lib/verification";
import type { Evidence } from "@/lib/schema";

export const metadata = { title: "Method & verification · OAuth Readiness" };

const VERDICT = {
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  corrected: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300",
  unverifiable: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-300",
};

export default function MethodPage() {
  const log = getVerificationLog();
  const names = Object.fromEntries(listGuides().map((g) => [g.slug, g.name]));
  const tally = { confirmed: 0, corrected: 0, unverifiable: 0 };
  for (const c of log?.claims ?? []) tally[c.verdict]++;

  return (
    <div className="max-w-3xl space-y-12">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">How these guides are made and checked</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          A guide is only useful if you can tell which parts to trust. Each guide is produced by research agents and labels every claim with the evidence behind it. A separate verifier pass then spot-checks a sample against primary sources.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Evidence labels</h2>
        <ul className="space-y-2">
          {(Object.keys(EVIDENCE) as Evidence[]).map((k) => (
            <li key={k} className="flex items-start gap-3 text-sm">
              <span className={`mt-0.5 w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium ring-1 ring-inset ${EVIDENCE[k].className}`}>{EVIDENCE[k].label}</span>
              <span className="text-zinc-600 dark:text-zinc-400">{EVIDENCE[k].hint}.{k === "tested" && " For example, an agent hit the authorize endpoint with a placeholder client_id and recorded the exact error the provider returned."}{k === "reported" && " Approval wait times usually land here: providers rarely publish them."}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">How the agents work</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li><span className="font-medium text-zinc-900 dark:text-zinc-100">Research.</span> Claude searches the web and reads the provider&apos;s developer docs, policy pages and Composio&apos;s managed-auth directory, following a fixed checklist: OAuth support, console and account requirements, endpoints and tokens, scopes, review triggers, pre-approval limits, customer-side admin blockers and the fastest path.</li>
          <li><span className="font-medium text-zinc-900 dark:text-zinc-100">Probe.</span> A <code>probe_endpoint</code> tool makes real, unauthenticated requests to the provider&apos;s authorize endpoint and developer console, and records the status and error text. Agents never create accounts or submit forms; those steps are marked as yours.</li>
          <li><span className="font-medium text-zinc-900 dark:text-zinc-100">Write.</span> A second model call converts the research notes into the guide schema using structured outputs, so every claim carries an evidence label and source ids. The rule is to downgrade the label when in doubt.</li>
          <li><span className="font-medium text-zinc-900 dark:text-zinc-100">Verify (curated guides).</span> An independent agent that did not write the guide re-checks high-stakes claims (review triggers, caps, costs, token lifetimes) against primary sources. Corrections are applied to the guide and logged below.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Verification log</h2>
        {!log ? (
          <p className="text-sm text-zinc-500">Verification has not been run yet.</p>
        ) : (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {log.method} Checked {log.checkedAt}: <span className="font-medium">{tally.confirmed} confirmed</span>, <span className="font-medium text-rose-600">{tally.corrected} corrected</span>, <span className="font-medium">{tally.unverifiable} could not be verified</span>.
            </p>
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {log.claims.map((c, i) => (
                <li key={i} className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${VERDICT[c.verdict]}`}>{c.verdict}</span>
                    <Link href={`/apps/${c.guide}`} className="text-xs font-medium text-zinc-500 hover:underline">{names[c.guide] ?? c.guide}</Link>
                  </div>
                  <p className="font-medium">{c.claim}</p>
                  <p className="text-zinc-600 dark:text-zinc-400">{c.finding} <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted">source</a></p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Known limits</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>No guide went through a full provider approval. Wait times come from docs where they exist and from community reports otherwise, and are labelled that way.</li>
          <li>Agents do not sign in to developer consoles, so console field names come from docs and may lag UI changes.</li>
          <li>Live-generated guides are not human-reviewed or put through the verifier pass. They show their own evidence labels and uncertainties.</li>
        </ul>
      </section>
    </div>
  );
}
