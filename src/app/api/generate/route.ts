import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { get, put } from "@vercel/blob";
import { waitUntil } from "@vercel/functions";
import { runStep, startState, type AgentState, type StepEvent, type StoredStep } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

const STATE_TTL_MS = 30 * 60 * 1000;

// The client carries the agent state between steps. It is signed so a client can't swap in its own
// conversation and use this endpoint as a general-purpose model proxy.
function secret() {
  return process.env.STATE_SECRET ?? createHash("sha256").update(`state:${process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN}`).digest("hex");
}
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function seal(state: AgentState): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + STATE_TTL_MS, state })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function unseal(token: string): AgentState | null {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { exp, state } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp: number; state: AgentState };
    return exp > Date.now() ? state : null;
  } catch {
    return null;
  }
}

/** Turns SDK errors (which embed raw JSON) into a sentence a visitor can act on. */
function friendlyError(err: unknown): string {
  const apiMessage = (err as { error?: { error?: { message?: string } } }).error?.error?.message;
  const message = apiMessage ?? (err as Error).message ?? "Unknown error";
  if (/credit balance/i.test(message)) return "Live generation is paused: this deployment's Anthropic API credits have run out. The curated guides still work.";
  if ((err as { status?: number }).status === 429 || (err as { status?: number }).status === 529)
    return "The model is busy right now. Try again in a minute.";
  return message;
}

// Finished steps are saved to a private Blob store so a client whose stream was cut (some networks drop
// long HTTP/2 responses) can fetch the result instead of re-running the step. Optional: without
// BLOB_READ_WRITE_TOKEN, a dropped step is simply retried.
const stepPath = (id: string) => `steps/${id}.json`;
const canStore = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/**
 * Runs one step of a live generation and streams its progress as newline-delimited JSON (see StepEvent).
 * Body is `{ app }` to start or `{ state }` to continue.
 */
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN)
    return Response.json({ error: "Live generation is not configured: set ANTHROPIC_API_KEY." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { app?: string; state?: string };

  let state: AgentState | null;
  if (body.state) {
    state = unseal(body.state);
    if (!state) return Response.json({ error: "This run expired. Start it again." }, { status: 400 });
  } else {
    const name = (body.app ?? "").trim().slice(0, 120);
    if (!name) return Response.json({ error: "Provide an app name or website." }, { status: 400 });
    state = startState(name);
  }

  const id = randomUUID();
  const encoder = new TextEncoder();
  let open = true;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start: (c) => void (controller = c),
    // The step keeps running after a disconnect so its result can still be saved and polled.
    cancel: () => void (open = false),
  });
  const send = (chunk: string) => {
    if (!open) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      open = false;
    }
  };
  const events: StepEvent[] = [];
  const emit = (e: StepEvent) => {
    if (e.type !== "note") events.push(e);
    send(JSON.stringify(e) + "\n");
  };

  const work = (async () => {
    emit({ type: "step", id: canStore() ? id : "" });
    // The model can think for a while between events; a blank-line heartbeat keeps proxies from treating
    // the response as idle (the client skips blank lines).
    const heartbeat = setInterval(() => send("\n"), 10_000);
    try {
      const next = await runStep(state, emit);
      if (next.phase === "done") emit({ type: "guide", guide: next.guide });
      else emit({ type: "next", state: seal(next) });
    } catch (err) {
      console.error("[generate] step failed", err);
      emit({ type: "error", message: friendlyError(err) });
    } finally {
      clearInterval(heartbeat);
    }
    if (canStore()) {
      const saved: StoredStep = { events };
      await put(stepPath(id), JSON.stringify(saved), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
      }).catch((err) => console.error("[generate] could not save step", err));
    }
    if (open) controller.close();
    open = false;
  })();
  waitUntil(work);

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
  });
}

/** Poll a step by id: 202 while it is still running, 200 with the StoredStep once it has finished. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("step") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id) || !canStore()) return Response.json({ error: "Unknown step." }, { status: 404 });
  const blob = await get(stepPath(id), { access: "private", useCache: false }).catch(() => null);
  if (!blob || blob.statusCode !== 200) return Response.json({ pending: true }, { status: 202, headers: { "cache-control": "no-store" } });
  return new Response(blob.stream, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
