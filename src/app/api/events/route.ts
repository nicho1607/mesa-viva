import { getSession } from "@/lib/auth";
import { resolveAuthorizedChannel } from "@/lib/realtime/authorize";
import { subscribe } from "@/lib/realtime/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PING_MS = 25_000;

/**
 * Stream SSE de señales. Autoriza un único canal (ver resolveAuthorizedChannel)
 * y reenvía `event: <nombre>\ndata: <payload>`; `event: ready` al abrir y tras
 * una reconexión del bus (el cliente debe refrescar).
 */
export async function GET(req: Request) {
  const tableToken = new URL(req.url).searchParams.get("table");
  let channel: string | null = null;
  try {
    channel = await resolveAuthorizedChannel({
      tableToken,
      session: tableToken === null ? await getSession() : null,
    });
  } catch (e) {
    console.error("[realtime] error autorizando /api/events", e);
    return new Response("Error", { status: 500 });
  }
  if (!channel) return new Response("No autorizado", { status: 401 });
  const ch = channel;

  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      let closed = false;
      const write = (s: string) => {
        if (closed) return;
        try {
          ctrl.enqueue(enc.encode(s));
        } catch {
          cleanup();
        }
      };

      const unsub = subscribe(ch, (msg) => {
        if (msg.kind === "resync") write(`event: ready\ndata: {}\n\n`);
        else write(`event: ${msg.event}\ndata: ${JSON.stringify(msg.payload)}\n\n`);
      });
      const ping = setInterval(() => write(": ping\n\n"), PING_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsub();
        req.signal.removeEventListener("abort", cleanup);
        try {
          ctrl.close();
        } catch {
          // ya cerrado/cancelado
        }
      };
      req.signal.addEventListener("abort", cleanup);
      if (req.signal.aborted) return cleanup();

      write(`retry: 3000\nevent: ready\ndata: {}\n\n`);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
