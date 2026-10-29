# OAuth Readiness

**Will your OAuth app take an hour or six weeks?** OAuth Readiness gives developers building AI agents a shareable, evidence-labelled guide for creating an OAuth app with a provider and getting it approved: effort, approval wait, what triggers review, what will block you, and which steps an agent can do for you.

- **Library**: curated guides for apps with deliberately different setup paths (GitHub, Notion, Slack, HubSpot, Salesforce, Microsoft Outlook, Gmail, X).
- **Live generation**: type any app name or website. An agent researches the provider's docs, probes its real OAuth endpoints and writes a guide in 1–3 minutes, with a share link.
- **Method page** (`/method`): the evidence labels, how the agents work, and a verification log of claims that were confirmed, corrected or couldn't be verified.

## Setup

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (only needed for live generation)
npm run dev                  # http://localhost:3000
npx tsx scripts/validate.ts  # validate all guides against the schema + source references
```

Deploy: import the repo into Vercel and set `ANTHROPIC_API_KEY`. Live generation runs up to 300s per request (`maxDuration`). Optional: `ANTHROPIC_MODEL` (default `claude-opus-5-5`).

## The problem as I understood it

A developer's integration has three layers: **the provider** (Google, Slack…), **one OAuth app** the developer registers with that provider (client id/secret, redirect URIs, scopes, consent-screen branding), and **many user connections**: each end user granting that app access. Composio's managed OAuth apps let developers skip layer two at first. To go to production under their own brand, or for apps without a managed app, developers must register and often get approval for their own.

The hard part isn't the OAuth code. It's the **variance between providers**, which developers can't see upfront:

| | Self-serve? | Gate before external users | Typical wait |
|---|---|---|---|
| GitHub, Notion | yes | none / light | minutes |
| Slack, HubSpot | yes | marketplace listing (optional but consequential) | days–weeks |
| Microsoft | yes | publisher verification + customer admin consent | days, plus per-customer |
| Salesforce | yes | customer admins must allow the app | per-customer |
| Gmail | yes | restricted-scope verification + annual CASA audit | weeks–months |
| X | paid tier | API access tier | instant once you pay |

So the guide's job is to answer, in this order: **how bad is it, how long, what will block me, and what can I do today.**

## Key decisions

1. **Lead with the verdict and the fastest path.** Every guide opens with difficulty, hands-on effort, approval wait, *time to first test connection* versus *time to external users*, and cost. These are separate because "you can test today but customers wait 6 weeks" is the most common and most misunderstood case. A "fastest path today" callout (test users, internal app, or a Composio managed app) keeps the approval wait from blocking development.
2. **Evidence labels on every claim.** Each step, requirement, scope, blocker and verdict is labelled `tested` / `documented` / `reported` / `inferred`, with source links. Review timelines are almost never documented. Saying so honestly is more useful than a confident number, and it tells the developer exactly what to confirm.
3. **Agent vs. human is part of the guide.** Each step is tagged *Agent can do* / *You* / *either*. Agents can draft privacy policies, fill console forms, write the integration, and probe endpoints. Humans must own accounts, accept legal terms, pay, verify identity or business, record demo videos, and talk to the provider.
4. **One schema for curated and live guides.** A zod schema (`src/lib/schema.ts`) is the contract. Curated research agents wrote JSON against it (validated by `scripts/validate.ts`, which also checks every cited source id exists). The live agent's writing step uses Claude structured outputs with the same schema, so live and curated guides render identically.
5. **Research, then write.** The live agent runs in two calls. (a) Research: Claude with web search, web fetch and a custom `probe_endpoint` tool, which makes a real unauthenticated request to the authorize URL or console and records the status and error text. That's where `tested` evidence comes from. (b) Writing: a structured-output call that turns the research notes into the guide, told to downgrade evidence when in doubt. They're split because structured outputs and web citations can't share a call, and because it keeps the evidence rules in one focused prompt.
6. **Progress, not just reading.** Steps are a checklist with progress saved in the browser. "Copy as Markdown" drops the guide into a ticket, PR or Notion page with checkboxes and source links.
7. **Shareable without a database.** Live guides are compressed into the URL fragment (`/g#…`). No storage, no credentials, and the link always shows exactly the version that was generated. Curated guides have stable URLs (`/apps/<slug>`).

### Scope I chose not to do

- No accounts, no saved history, no database. Sharing works through the URL.
- Agents don't sign in to consoles or create apps. Doing that safely needs the developer's own credentials and a human approval step, so it's out of scope for a take-home. Instead the guide marks precisely which steps an agent could take over.
- Eight curated guides, not 100. The schema, validation script and research prompt are how the library would scale: run the research-plus-verify pipeline per app, review the diff, merge.

## Verification

See `/method` (data in `data/verification.json`). An independent verifier agent that didn't write the guides re-checked a sample of high-stakes claims (review triggers, caps, costs, token lifetimes) against primary sources. Corrections were applied to the guides and are listed with the reason.

## Limitations

- No provider approval was carried through to completion, so wait times are reported or inferred and labelled as such.
- Console UI field names come from docs and can drift.
- Live guides aren't put through the verifier pass. Their quality depends on what the provider documents publicly, and they show their own uncertainties.
- Live generation needs an Anthropic API key and costs roughly the price of one long Claude agent session per guide. There's no rate limiting beyond input length.

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
