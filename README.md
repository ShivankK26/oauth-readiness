# OAuth Readiness

**Live: https://oauth-readiness-iota.vercel.app** · Repo: https://github.com/ShivankK26/oauth-readiness

**Will your OAuth app take an hour or six weeks?** OAuth Readiness gives developers building AI agents a shareable, evidence-labelled guide for creating an OAuth app with a provider and getting it approved: effort, approval wait, what triggers review, what will block you, and which steps an agent can do for you.

- **Library**: 8 curated guides for apps with deliberately different setup paths, from instant (GitHub, Notion) to a security audit (Gmail): Slack, HubSpot, Microsoft Outlook, Salesforce and X in between.
- **Live generation**: type any app name or website. An agent researches the provider's docs, probes its real OAuth endpoints and writes a guide in 1–3 minutes, with a share link.
- **Method page** (`/method`): the evidence labels, how the agents work, and a verification log of claims that were confirmed, corrected or couldn't be verified.

## Setup

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (only needed for live generation)
npm run dev                  # http://localhost:3000
npx tsx scripts/validate.ts  # validate all guides against the schema + source references
npx tsx --env-file=.env.local scripts/live-test.ts "Calendly" out.json   # one live generation from the CLI
```

Deploy: import the repo into Vercel and set `ANTHROPIC_API_KEY`. Recommended: create a private Blob store (`vercel blob create-store <name> --access private`) so live runs survive dropped connections. Optional: `ANTHROPIC_MODEL` (default `claude-opus-5-5`).

## The problem as I understood it

A developer's integration has three layers: **the provider** (Google, Slack…), **one OAuth app** the developer registers with that provider (client id/secret, redirect URIs, scopes, consent-screen branding), and **many user connections**: each end user granting that app access. Composio's managed OAuth apps let developers skip layer two at first. To go to production under their own brand, or for apps without a managed app, developers must register and often get approval for their own.

The hard part isn't the OAuth code. It's the **variance between providers**, which developers can't see upfront:

What the research found (see each guide for sources and evidence labels):

| App | Verdict | The gate that matters | Wait |
|---|---|---|---|
| GitHub | Easy | None from GitHub; customer org owners may restrict third-party apps | none |
| Notion | Easy | None to use OAuth; Marketplace listing optional | none (listing 5–10 business days) |
| Slack | Moderate | Unlisted commercial apps are limited to 1 req/min on history reads (new installs since May 2025, existing installs since March 2026); Marketplace needs 10 active workspaces | up to ~10 weeks for Marketplace (stated max) |
| HubSpot | Moderate | Unlisted apps capped at 25 installs; new apps must use the projects platform | listing review ~10 business days to first feedback |
| Microsoft Outlook | Moderate | Default tenant consent policy blocks users from consenting to Mail.Read, so customer admins must approve | per customer, plus publisher verification |
| X | Moderate | No review, but pay-per-use API credits and no free tier | none once paying |
| Salesforce | Hard | Customer orgs must install or allow the app (2025 change); new apps are External Client Apps | per customer; AppExchange review ~4–8+ weeks |
| Gmail | Very hard | Restricted scopes (read/modify/compose) need verification plus an annual CASA security assessment; send-only avoids it | reportedly 4–8 weeks |

So the guide's job is to answer, in this order: **how bad is it, how long, what will block me, and what can I do today.**

## Key decisions

1. **Lead with the verdict and the fastest path.** Every guide opens with difficulty, hands-on effort, approval wait, *time to first test connection* versus *time to external users*, and cost. These are separate because "you can test today but customers wait 6 weeks" is the most common and most misunderstood case. A "fastest path today" callout (test users, internal app, or a Composio managed app) keeps the approval wait from blocking development.
2. **Evidence labels on every claim.** Each step, requirement, scope, blocker and verdict is labelled `tested` / `documented` / `reported` / `inferred`, with source links. Review timelines are almost never documented. Saying so honestly is more useful than a confident number, and it tells the developer exactly what to confirm.
3. **Agent vs. human is part of the guide.** Each step is tagged *Agent can do* / *You* / *either*. Agents can draft privacy policies, fill console forms, write the integration, and probe endpoints. Humans must own accounts, accept legal terms, pay, verify identity or business, record demo videos, and talk to the provider.
4. **One schema for curated and live guides.** A zod schema (`src/lib/schema.ts`) is the contract. Curated research agents wrote JSON against it (validated by `scripts/validate.ts`, which also checks every cited source id exists). The live agent's writing step uses Claude structured outputs with the same schema, so live and curated guides render identically.
5. **Research, then write.** The live agent runs in two calls. (a) Research: Claude with web search, web fetch and a custom `probe_endpoint` tool, which makes a real unauthenticated request to the authorize URL or console and records the status and error text. That's where `tested` evidence comes from. (b) Writing: a second call that turns the research notes into guide JSON, told to downgrade evidence when in doubt. The output is validated against the same zod schema, and validation errors are sent back for one repair turn. I first used constrained structured outputs here, but the guide schema is too deeply nested for the decoding grammar ("compiled grammar is too large"), so validate-and-repair it is. Splitting the calls also keeps the evidence rules in one focused prompt.
6. **Progress, not just reading.** Steps are a checklist with progress saved in the browser. "Copy as Markdown" drops the guide into a ticket, PR or Notion page with checkboxes and source links.
7. **Live runs are short, resumable steps.** A run is 3–6 requests, not one long response: each request does one research turn or one writing attempt (30–70s), streams its progress, and ends with the conversation state for the next step. The state is HMAC-signed, so the endpoint can't be used as a general Claude proxy. I got here the hard way. On the deployed site, a single 3-minute HTTP/2 stream was cut at 56–187s on my network, while the same request over HTTP/1.1 finished. So each finished step is also saved to a private Vercel Blob. If a stream drops, the browser polls for that step's result instead of re-running it. This also takes total run time out from under the 300s function limit.
8. **Shareable without a database.** Live guides are compressed into the URL fragment (`/g#…`). No storage, no credentials, and the link always shows exactly the version that was generated. Curated guides have stable URLs (`/apps/<slug>`).

### Scope I chose not to do

- No accounts, no saved history, no database. Sharing works through the URL.
- Agents don't sign in to consoles or create apps. Doing that safely needs the developer's own credentials and a human approval step, so it's out of scope for a take-home. Instead the guide marks precisely which steps an agent could take over.
- Eight curated guides, not 100. The schema, validation script and research prompt are how the library would scale: run the research-plus-verify pipeline per app, review the diff, merge.

## Verification

See `/method` (data in `data/verification.json`). An independent verifier agent that didn't write the guides re-checked a sample of high-stakes claims (review triggers, caps, costs, token lifetimes) against primary sources. Corrections were applied to the guides and are listed with the reason.

**Result: 31 claims checked. 24 confirmed, 5 corrected, 2 couldn't be verified.** The corrections show why the labels matter:

- **Slack**: the guide said existing installs were exempt from the 2025 rate limit for unlisted apps. Slack's changelog says it applies to existing installs from March 3, 2026.
- **Salesforce**: the guide said the first AppExchange security-review stage takes "1–2 weeks". Salesforce says 1–2 days.
- **Gmail**: a CASA cost range was labelled *documented*. Google publishes no prices, so it's now *reported*, with vendor figures.
- **Salesforce and Notion**: two claims were over-labelled (*tested* → *documented*, *documented* → *reported*).
- **Couldn't verify**: two Salesforce policy changes (Salesforce's help pages returned 403 to agents). Both are now *reported* and listed under the guide's uncertainties.

### Live generation, tested end to end

Live runs: Calendly from the CLI, Airtable through the local UI, and Linear on the deployed site, both as one long HTTP/1.1 request and through the stepped UI. The deployed UI run took 275s in four steps (56s, 133s, 44s, 37s) and used 13 sources. The second step's connection dropped mid-step on my network. The page polled the saved step result and carried on without re-running it, which is the recovery path working for real. Calendly took 170s: 134s research with 9 probes and ~15 searches, 36s writing. The guide validated on the first try, with no dangling source ids. Its verdict: easy, PKCE (S256) required, refresh tokens rotate on every use, Composio managed app available. It listed 8 open uncertainties, including access-token lifetime and rate limits found only in third-party sources.

## Limitations

- No provider approval was carried through to completion, so wait times are reported or inferred and labelled as such.
- Console UI field names come from docs and can drift.
- Live guides aren't put through the verifier pass. Their quality depends on what the provider documents publicly, and they show their own uncertainties.
- Live generation needs an Anthropic API key and costs roughly the price of one long Claude agent session per guide. There's no rate limiting beyond input length. When credits run out, the generator says so and the curated library keeps working.
- Saved step results stay in the Blob store. They hold public-docs research only, under unguessable ids, but nothing deletes them yet.

## Structure

```
data/guides/*.json        curated guides (schema-validated)
data/verification.json    verification log rendered on /method
src/lib/schema.ts         guide schema (zod), shared by curated + live
src/lib/agent.ts          live research agent (search, fetch, probe → structured guide)
src/app/api/generate      streaming NDJSON endpoint for live generation
src/components/GuideView  the guide UI
scripts/validate.ts       schema + citation validation
```
