import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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
- 3–5 phases; mark provider waiting phases with isWait=true.`;

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

export async function generateGuide(app: string, emit: Emit, signal?: AbortSignal): Promise<Guide> {
  const client = new Anthropic();
  const tools: Anthropic.ToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 8 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10 },
    probeTool,
  ];
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `App to investigate: ${app}\nToday's date: ${new Date().toISOString().slice(0, 10)}. Be efficient: aim to finish within ~15 tool calls.`,
    },
  ];

  emit({ type: "status", message: `Researching ${app}…` });
  let dossier = "";
  for (let turn = 0; turn < 12; turn++) {
    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: 32000,
        system: RESEARCH_SYSTEM,
        output_config: { effort: "medium" },
        tools,
        messages,
      },
      { signal }
    );
    stream.on("text", (delta) => emit({ type: "note", text: delta }));
    stream.on("contentBlock", (block) => {
      if (block.type === "server_tool_use") {
        const input = block.input as { query?: string; url?: string };
        if (block.name === "web_search" && input.query) emit({ type: "search", query: input.query });
        if (block.name === "web_fetch" && input.url) emit({ type: "fetch", url: input.url });
      }
    });
    const msg = await stream.finalMessage();
    messages.push({ role: "assistant", content: msg.content });

    if (msg.stop_reason === "pause_turn") continue;
    if (msg.stop_reason === "refusal") throw new Error("The model declined this request.");
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
      continue;
    }
    // end_turn or max_tokens: collect the dossier text from the whole research transcript
    dossier = messages
      .filter((m) => m.role === "assistant")
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n");
    break;
  }
  if (!dossier.trim()) throw new Error("Research did not produce findings.");

  emit({ type: "status", message: "Writing the guide…" });
  const res = await client.messages.parse(
    {
      model: MODEL,
      max_tokens: 32000,
      system: SYNTH_SYSTEM,
      output_config: { effort: "low", format: zodOutputFormat(Guide) },
      messages: [
        {
          role: "user",
          content: `App: ${app}\nslug: ${slugify(app)}\nreviewedAt: ${new Date().toISOString().slice(0, 10)}\n\nResearch dossier:\n${dossier}`,
        },
      ],
    },
    { signal }
  );
  if (!res.parsed_output) throw new Error(`Guide synthesis failed (stop_reason: ${res.stop_reason}).`);
  const guide = res.parsed_output;
  guide.meta.origin = "live";
  return guide;
}
