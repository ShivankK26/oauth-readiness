import { generateGuide, type AgentEvent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

// Streams agent progress as newline-delimited JSON events, ending with a `guide` or `error` event.
export async function POST(req: Request) {
  const { app } = (await req.json().catch(() => ({}))) as { app?: string };
  const name = (app ?? "").trim().slice(0, 120);
  if (!name) return Response.json({ error: "Provide an app name or website." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN)
    return Response.json({ error: "Live generation is not configured: set ANTHROPIC_API_KEY." }, { status: 503 });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      // The model can think for a minute or more between events; a blank-line heartbeat keeps proxies
      // from dropping the idle connection (the client skips blank lines).
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode("\n")), 10_000);
      try {
        const guide = await generateGuide(name, emit, req.signal);
        emit({ type: "guide", guide });
      } catch (err) {
        emit({ type: "error", message: (err as Error).message });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}
