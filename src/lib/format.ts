import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { Guide, type Difficulty, type Evidence, type Owner } from "./schema";

export const DIFFICULTY: Record<Difficulty, { label: string; className: string }> = {
  easy: { label: "Easy", className: "bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300" },
  moderate: { label: "Moderate", className: "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300" },
  hard: { label: "Hard", className: "bg-orange-100 text-orange-800 ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300" },
  very_hard: { label: "Very hard", className: "bg-rose-100 text-rose-800 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300" },
};

export const EVIDENCE: Record<Evidence, { label: string; hint: string; className: string }> = {
  tested: { label: "Tested", hint: "Observed directly by probing the provider", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300" },
  documented: { label: "Documented", hint: "Stated in the provider's official docs", className: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300" },
  reported: { label: "Reported", hint: "Community or third-party sources only", className: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300" },
  inferred: { label: "Inferred", hint: "Reasoned from indirect evidence — verify yourself", className: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-300" },
};

export const OWNER: Record<Owner, { label: string; className: string }> = {
  agent: { label: "Agent can do", className: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300" },
  human: { label: "You", className: "bg-zinc-900 text-white ring-zinc-900 dark:bg-white dark:text-zinc-900" },
  either: { label: "Agent or you", className: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-300" },
};

/** Counts the evidence level of every cited claim in a guide. */
export function evidenceCounts(g: Guide): Record<Evidence, number> {
  const counts: Record<Evidence, number> = { tested: 0, documented: 0, reported: 0, inferred: 0 };
  JSON.stringify(g, (k, v) => {
    if (k === "evidence" && v in counts) counts[v as Evidence]++;
    return v;
  });
  return counts;
}

export const encodeGuide = (g: Guide) => compressToEncodedURIComponent(JSON.stringify(g));

export function decodeGuide(data: string): Guide | null {
  try {
    const parsed = Guide.safeParse(JSON.parse(decompressFromEncodedURIComponent(data) ?? ""));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function guideToMarkdown(g: Guide, url?: string): string {
  const src = (ids: string[]) =>
    ids.length ? " " + ids.map((id) => `[${id}](${g.sources.find((s) => s.id === id)?.url ?? "#"})`).join(" ") : "";
  const ev = (e: Evidence) => `_${EVIDENCE[e].label}_`;
  const v = g.verdict;
  const lines = [
    `# ${g.name} — OAuth app setup guide`,
    url ? `Source: ${url}` : "",
    "",
    `> ${g.oneLiner}`,
    "",
    `| Difficulty | Hands-on effort | Approval wait | First test connection | Production |`,
    `|---|---|---|---|---|`,
    `| ${DIFFICULTY[v.difficulty].label} | ${v.activeEffort} | ${v.approvalWait} | ${v.timeToFirstConnection} | ${v.timeToProduction} |`,
    "",
    `**Review:** ${v.reviewRequired} — ${v.reviewTrigger}  `,
    `**Cost:** ${v.cost}`,
    "",
    `**Fastest path:** ${g.fastPath}`,
    "",
    `## Steps`,
    ...g.phases.flatMap((p, i) => [
      "",
      `### ${i + 1}. ${p.title} (${p.duration})`,
      ...p.steps.map((s) => `- [ ] **${s.title}** (${OWNER[s.owner].label}, ${ev(s.evidence)}${src(s.sourceIds)}) — ${s.detail}`),
    ]),
    "",
    `## Requirements`,
    ...g.requirements.map((r) => `- ${r.blocking ? "**Blocking:** " : ""}${r.item} — ${r.detail} (${ev(r.evidence)}${src(r.sourceIds)})`),
    "",
    `## Scopes`,
    `| Scope | Purpose | Tier | Triggers review |`,
    `|---|---|---|---|`,
    ...g.scopes.map((s) => `| \`${s.scope}\` | ${s.purpose} | ${s.tier} | ${s.triggersReview ? "yes" : "no"} |`),
    "",
    `## Blockers`,
    ...g.blockers.map((b) => `- **${b.blocker}** — you'll see: ${b.symptom}. Fix: ${b.resolution}`),
    "",
    `## Agent vs. you`,
    `**An agent can:**`,
    ...g.agentHandoff.agentCan.map((x) => `- ${x}`),
    `**You must:**`,
    ...g.agentHandoff.humanMust.map((x) => `- ${x}`),
    "",
    `## Technical`,
    `- Console: ${g.technical.consoleUrl}`,
    `- Authorize URL: \`${g.technical.authorizeUrl}\``,
    `- Token URL: \`${g.technical.tokenUrl}\``,
    `- PKCE: ${g.technical.pkce}`,
    `- Tokens: ${g.technical.refreshTokens}`,
    `- Redirect URIs: ${g.technical.redirectUriRules}`,
    ...g.technical.gotchas.map((x) => `- Gotcha: ${x}`),
    "",
    `## Not verified`,
    ...g.uncertainties.map((x) => `- ${x}`),
    "",
    `## Sources`,
    ...g.sources.map((s) => `- ${s.id}: [${s.title}](${s.url}) (${s.kind})`),
    "",
    `_Reviewed ${g.meta.reviewedAt} · ${g.meta.origin === "live" ? "generated live by agent" : "curated"}_`,
  ];
  return lines.join("\n");
}
