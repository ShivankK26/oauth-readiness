import { z } from "zod";

// Evidence level attached to every material claim in a guide.
// - tested: an agent or human observed it directly (opened the console, hit the endpoint, saw the form)
// - documented: stated in the provider's own docs (cited)
// - reported: community / third-party sources only (forum, blog, changelog aggregators)
// - inferred: reasoned from indirect evidence; treat as a hypothesis
export const Evidence = z.enum(["tested", "documented", "reported", "inferred"]);
export type Evidence = z.infer<typeof Evidence>;

export const Owner = z.enum(["agent", "human", "either"]);
export type Owner = z.infer<typeof Owner>;

export const Difficulty = z.enum(["easy", "moderate", "hard", "very_hard"]);
export type Difficulty = z.infer<typeof Difficulty>;

const Cited = {
  evidence: Evidence,
  sourceIds: z.array(z.string()).describe("ids from the sources array backing this claim"),
};

export const Step = z.object({
  title: z.string(),
  detail: z.string().describe("Concrete instructions: where to click, what to enter, exact values"),
  owner: Owner.describe("agent = an AI agent with browser/API access can do it; human = needs a person (legal, payment, identity, account ownership, judgement); either"),
  ...Cited,
});

export const Phase = z.object({
  title: z.string(),
  duration: z.string().describe("Elapsed time for this phase, e.g. '10 min' or '2–6 weeks (waiting on Google)'"),
  isWait: z.boolean().describe("true if this phase is mostly waiting on the provider"),
  steps: z.array(Step),
});

export const Guide = z.object({
  slug: z.string(),
  name: z.string(),
  website: z.string(),
  category: z.string(),
  oneLiner: z.string().describe("One sentence a developer can read to know what they're in for"),
  verdict: z.object({
    difficulty: Difficulty,
    activeEffort: z.string().describe("Hands-on time, e.g. '15–30 min'"),
    approvalWait: z.string().describe("Provider review wait, e.g. 'None' or '4–12 weeks'"),
    timeToFirstConnection: z.string().describe("How soon a test user (you) can connect, often before approval"),
    timeToProduction: z.string().describe("How soon arbitrary external users can connect"),
    reviewRequired: z.enum(["none", "conditional", "always"]),
    reviewTrigger: z.string().describe("What triggers review, e.g. 'Restricted Gmail scopes' or 'Listing in the marketplace'"),
    cost: z.string().describe("Fees, paid tiers, audits. 'Free' if none"),
    ...Cited,
  }),
  fastPath: z.string().describe("The quickest way to get working today, e.g. use a managed OAuth app, test mode, internal app"),
  phases: z.array(Phase),
  requirements: z.array(
    z.object({
      item: z.string(),
      detail: z.string(),
      blocking: z.boolean().describe("true if you cannot ship without it"),
      ...Cited,
    })
  ),
  scopes: z.array(
    z.object({
      scope: z.string(),
      purpose: z.string(),
      tier: z.enum(["basic", "sensitive", "restricted", "admin", "unknown"]),
      triggersReview: z.boolean(),
      ...Cited,
    })
  ),
  technical: z.object({
    consoleUrl: z.string(),
    authorizeUrl: z.string(),
    tokenUrl: z.string(),
    pkce: z.string().describe("supported / required / not supported / unknown"),
    refreshTokens: z.string().describe("Do access tokens expire, are refresh tokens issued, how"),
    redirectUriRules: z.string(),
    gotchas: z.array(z.string()),
    ...Cited,
  }),
  blockers: z.array(
    z.object({
      blocker: z.string(),
      symptom: z.string().describe("How you'll know you've hit it (error text, rejection email, UI state)"),
      resolution: z.string(),
      ...Cited,
    })
  ),
  agentHandoff: z.object({
    agentCan: z.array(z.string()),
    humanMust: z.array(z.string()),
  }),
  uncertainties: z.array(z.string()).describe("What we could not verify or where sources conflict"),
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
      kind: z.enum(["official_docs", "official_policy", "community", "setup_attempt", "other"]),
    })
  ),
  meta: z.object({
    origin: z.enum(["curated", "live"]),
    reviewedAt: z.string().describe("ISO date"),
    verificationNotes: z.array(z.string()).describe("What was checked hands-on, what was corrected"),
  }),
});

export type Guide = z.infer<typeof Guide>;
export type Step = z.infer<typeof Step>;
export type Phase = z.infer<typeof Phase>;
