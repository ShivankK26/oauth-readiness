import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Guide } from "./schema";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "search"; query: string }
  | { type: "fetch"; url: string }
  | { type: "probe"; url: string; result: string }
  | { type: "note"; text: string }
  | { type: "guide"; guide: Guide }
  | { type: "error"; message: string };

/**
 * What the API streams: `step` first (an id to poll if the stream drops), then agent events, then one of
 * `next` (the signed state to send back for the following step), `guide` or `error`.
 */
export type StepEvent = AgentEvent | { type: "step"; id: string } | { type: "next"; state: string };
/** A finished step as saved for polling: every non-note event, the last of which is the result. */
export type StoredStep = { events: StepEvent[] };

type Emit = (e: AgentEvent) => void;

const RESEARCH_SYSTEM = `You are an integrations engineer investigating what it takes for a developer to create and ship their own OAuth app with a third-party provider, so that end users of the developer's AI agent can connect their accounts.

Investigate, in roughly this order, and stop searching once you have solid answers:
1. Does the provider support OAuth 2.0 for third-party apps at all? (If only API keys / PATs / partner-only, say so clearly — that is the most important finding.)
2. Where is the developer console, what account is needed (free? paid plan? partner programme? sales contact?), and what does app creation ask for (fields, redirect URI rules, logo, privacy policy, etc.).
3. Authorization and token endpoints, PKCE, token lifetimes, refresh tokens.
4. Scopes an AI agent would typically need, and which are sensitive/restricted/admin-only or trigger review.
5. Review / verification / marketplace listing: is it required to let external users connect, what triggers it, what it asks for (demo video, security assessment, screencast, test credentials), documented or reported timelines, fees.
6. Limits before approval: test users, install caps, unverified-app warnings, rate limits or paid API tiers.
7. Customer-side blockers: admin consent, workspace/org approval, allow-lists.
8. Whether Composio offers a managed OAuth app for it (check https://docs.composio.dev/toolkits/managed-auth) — a way to start before your own app is approved.

Hands-on checks: use probe_endpoint to hit the authorize URL with a placeholder client_id (e.g. client_id=test&redirect_uri=https://example.com/cb&response_type=code) and the developer console URL. Report exactly what came back — that is "tested" evidence. Never submit forms or create accounts.

Prefer the provider's own docs. Keep a running list of URLs you relied on. When docs are silent (e.g. approval time), say so instead of guessing, and look for recent community reports.
Finish with a dense research dossier in plain text: findings grouped by the 8 topics, each with the URL(s) supporting it and whether it came from official docs, community reports, your probe, or inference. Include a section "Uncertain / conflicting".`;

const SYNTH_SYSTEM = `You turn an OAuth research dossier into a developer-facing setup guide as JSON.
Rules:
- Only state what the dossier supports. Every claim's evidence must match its support: "tested" only for probe_endpoint observations, "documented" for official docs, "reported" for community sources, "inferred" for reasoning. When in doubt, downgrade.
- sourceIds must reference entries in sources; build sources from the URLs in the dossier (kind: official_docs / official_policy / community / setup_attempt / other). Use ids s1, s2, ...
- Be concrete and practical: exact console paths, field names, scope strings, error text.
- difficulty: easy = self-serve, no review for external users; moderate = self-serve but review/listing for some paths or notable admin-consent friction; hard = mandatory review or paid tier before real users; very_hard = security audit / partner approval / weeks-to-months.
- owner per step: "agent" if an agent with a browser or API could do it (filling forms, drafting docs, writing code, probing endpoints); "human" for account ownership, payment, legal acceptance, identity/business verification, recording demo videos, talking to the provider; "either" otherwise.
- Put gaps into uncertainties. meta.origin = "live". meta.verificationNotes should list what was probed and what came back.
- 3–5 phases; mark provider waiting phases with isWait=true.
- Output a single JSON object and nothing else (no prose, no code fences). It must validate against this JSON Schema:
${JSON.stringify(z.toJSONSchema(Guide))}`;

const probeTool: Anthropic.Tool = {
  name: "probe_endpoint",
  description:
    "Make a single unauthenticated GET request to a public https URL (e.g. an OAuth authorize endpoint with a placeholder client_id, or a developer console URL) and return the status code, redirect location and the start of the body. Redirects are not followed. Use it to verify endpoints and observe error messages.",
  input_schema: {
    type: "object",
    properties: { url: { type: "string", description: "Absolute https URL" } },
    required: ["url"],
    additionalProperties: false,
  },
  strict: true,
};

function isPrivateAddress(ip: string) {
  if (ip.includes(":")) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith("::ffff:");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

export async function probe(rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "Invalid URL";
  }
  if (url.protocol !== "https:") return "Only https URLs are allowed";
  const host = url.hostname;
  const addr = isIP(host) ? host : (await lookup(host).catch(() => null))?.address;
  if (!addr || isPrivateAddress(addr)) return "Host not allowed";
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "oauth-readiness-probe/1.0 (+research)" },
    });
    const body = (await res.text()).replace(/\s+/g, " ").slice(0, 1500);
    const loc = res.headers.get("location");
    return `HTTP ${res.status}${loc ? `\nLocation: ${loc.slice(0, 500)}` : ""}\nBody: ${body}`;
  } catch (err) {
    return `Request failed: ${(err as Error).message}`;
  }
}

const slugify = (s: string) => s.toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const RESEARCH_TOOLS: Anthropic.ToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 8 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10 },
  probeTool,
];
const MAX_RESEARCH_TURNS = 12;
const MAX_WRITE_ATTEMPTS = 2;

/**
 * Conversation state between steps. Each step is one model call (plus any probes), so a run is a series of
 * short requests rather than one long-lived response, which some networks cut off. The route signs this
 * state and the client carries it between steps.
 */
export type AgentState =
  | { phase: "research"; app: string; turn: number; seen: string[]; messages: Anthropic.MessageParam[] }
  | { phase: "write"; app: string; attempt: number; messages: Anthropic.MessageParam[] }
  | { phase: "done"; guide: Guide };

export function startState(app: string): AgentState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    phase: "research",
    app,
    turn: 0,
    seen: [],
    messages: [
      { role: "user", content: `App to investigate: ${app}\nToday's date: ${today}. Be efficient: aim to finish within ~15 tool calls.` },
    ],
  };
}

/** Runs one step and returns the next state. */
export async function runStep(state: AgentState, emit: Emit, signal?: AbortSignal): Promise<AgentState> {
  if (state.phase === "research") return researchStep(state, emit, signal);
  if (state.phase === "write") return writeStep(state, emit, signal);
  return state;
}

export async function generateGuide(app: string, emit: Emit, signal?: AbortSignal): Promise<Guide> {
  let state = startState(app);
  while (state.phase !== "done") state = await runStep(state, emit, signal);
  return state.guide;
}

async function researchStep(
  state: Extract<AgentState, { phase: "research" }>,
  emit: Emit,
  signal?: AbortSignal
): Promise<AgentState> {
  const { app, messages } = state;
  const seen = new Set(state.seen);
  if (state.turn === 0) emit({ type: "status", message: `Researching ${app}…` });
  const stream = new Anthropic().messages.stream(
    {
      model: MODEL,
      max_tokens: 32000,
      system: RESEARCH_SYSTEM,
      output_config: { effort: "medium" },
      tools: RESEARCH_TOOLS,
      messages,
    },
    { signal }
  );
  stream.on("text", (delta) => emit({ type: "note", text: delta }));
  stream.on("contentBlock", (block) => {
    if (block.type !== "server_tool_use") return;
    const input = block.input as { query?: string; url?: string };
    // The same search can surface as more than one block; report each query/URL once.
    const key = `${block.name}:${input.query ?? input.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      if (block.name === "web_search" && input.query) emit({ type: "search", query: input.query });
      if (block.name === "web_fetch" && input.url) emit({ type: "fetch", url: input.url });
    }
  });
  const msg = await stream.finalMessage();
  messages.push({ role: "assistant", content: msg.content });
  if (msg.stop_reason === "refusal") throw new Error("The model declined this request.");

  const next = { ...state, turn: state.turn + 1, seen: [...seen], messages };
  if (msg.stop_reason === "tool_use") {
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of msg.content) {
      if (block.type !== "tool_use") continue;
      const url = String((block.input as { url?: string }).url ?? "");
      const result = await probe(url);
      emit({ type: "probe", url, result: result.slice(0, 200) });
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }
    messages.push({ role: "user", content: results });
  }
  const moreResearch = msg.stop_reason === "pause_turn" || msg.stop_reason === "tool_use";
  if (moreResearch && next.turn < MAX_RESEARCH_TURNS) return next;

  // end_turn, max_tokens or turn budget spent: the dossier is all research text written so far.
  const dossier = messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
  if (!dossier.trim()) throw new Error("Research did not produce findings.");
  emit({ type: "status", message: "Writing the guide…" });
  return {
    phase: "write",
    app,
    attempt: 0,
    messages: [
      {
        role: "user",
        content: `App: ${app}\nslug: ${slugify(app)}\nreviewedAt: ${new Date().toISOString().slice(0, 10)}\n\nResearch dossier:\n${dossier}`,
      },
    ],
  };
}

// Plain JSON validated with zod rather than structured outputs: the guide schema is too deeply nested
// for the constrained-decoding grammar ("compiled grammar is too large"). One repair turn on failure.
async function writeStep(
  state: Extract<AgentState, { phase: "write" }>,
  emit: Emit,
  signal?: AbortSignal
): Promise<AgentState> {
  const msg = await new Anthropic().messages
    .stream(
      { model: MODEL, max_tokens: 32000, system: SYNTH_SYSTEM, output_config: { effort: "low" }, messages: state.messages },
      { signal }
    )
    .finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The model declined this request.");
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = parseGuideJson(text);
  if (parsed.success) {
    parsed.data.meta.origin = "live";
    return { phase: "done", guide: parsed.data };
  }
  if (state.attempt + 1 >= MAX_WRITE_ATTEMPTS)
    throw new Error("Guide synthesis failed: the model's output did not match the guide schema.");
  emit({ type: "status", message: "Fixing the guide format…" });
  return {
    ...state,
    attempt: state.attempt + 1,
    messages: [
      ...state.messages,
      { role: "assistant", content: text || "(empty)" },
      { role: "user", content: `That output failed validation:\n${parsed.error}\nReturn the complete corrected JSON object only.` },
    ],
  };
}

function parseGuideJson(text: string): { success: true; data: Guide } | { success: false; error: string } {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    return { success: false, error: `Invalid JSON: ${(err as Error).message}` };
  }
  const res = Guide.safeParse(raw);
  if (res.success) return { success: true, data: res.data };
  return {
    success: false,
    error: res.error.issues.slice(0, 30).map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n"),
  };
}
