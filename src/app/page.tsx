import { AppSearch, type GuideSummary } from "@/components/AppSearch";
import { listGuides } from "@/lib/guides";

export default function Home() {
  const guides: GuideSummary[] = listGuides().map((g) => ({
    slug: g.slug,
    name: g.name,
    website: g.website,
    category: g.category,
    oneLiner: g.oneLiner,
    difficulty: g.verdict.difficulty,
    activeEffort: g.verdict.activeEffort,
    approvalWait: g.verdict.approvalWait,
    reviewRequired: g.verdict.reviewRequired,
  }));

  return (
    <div className="space-y-10">
      <section className="max-w-3xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">Will your OAuth app take an hour or six weeks?</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Before your AI agent&apos;s users can connect an app, you need your own OAuth app registered with that provider. Some providers approve it instantly. Others require security audits, marketplace review or a paid tier. Look up an app to see the effort, the wait, what blocks approval, and which steps an agent can do for you.
        </p>
      </section>
      <AppSearch guides={guides} />
      <section className="grid gap-4 rounded-xl bg-zinc-50 p-5 text-sm dark:bg-zinc-900 md:grid-cols-3">
        <div>
          <div className="font-semibold">Developer → OAuth app → users</div>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">You register one OAuth app per provider. Each of your users clicks &ldquo;Allow&rdquo; on that app&apos;s consent screen to create their connection. The review gate sits between your app and <em>external</em> users.</p>
        </div>
        <div>
          <div className="font-semibold">Ship today, approve in parallel</div>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">Every guide leads with the fastest path, such as test users, an internal app or a managed OAuth app like Composio&apos;s, so the approval wait doesn&apos;t block development.</p>
        </div>
        <div>
          <div className="font-semibold">Evidence on every claim</div>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">Each claim is labelled <em>tested</em>, <em>documented</em>, <em>reported</em> or <em>inferred</em>, with a source link. Review timelines are rarely documented, and the guides say so.</p>
        </div>
      </section>
    </div>
  );
}
