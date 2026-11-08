import { Client } from "pg";
import {
  PG_CHANNEL,
  isRealtimeEvent,
  sanitizePayload,
  type RealtimeEvent,
  type RealtimePayload,
} from "./events";

// Bus de servidor: UNA conexión pg dedicada por proceso con `LISTEN mesa_viva`,
// reparto en memoria a los suscriptores de cada canal. Vive en globalThis para
// sobrevivir al HMR. Si la conexión cae, reconecta con backoff y vuelve a hacer LISTEN;
// los suscriptores siguen registrados y reciben `{ kind: "resync" }` al volver
// (se pudieron perder señales: deben refrescar).

export type BusMessage =
  | { kind: "event"; event: RealtimeEvent; payload: RealtimePayload }
  | { kind: "resync" };
export type BusListener = (msg: BusMessage) => void;

type BusState = {
  listeners: Map<string, Set<BusListener>>;
  client: Client | null;
  connecting: Promise<void> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  attempt: number;
  stopped: boolean;
};

const MIN_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 10_000;

const g = globalThis as unknown as { __mesaVivaBus?: BusState };

function state(): BusState {
  g.__mesaVivaBus ??= {
    listeners: new Map(),
    client: null,
    connecting: null,
    retryTimer: null,
    attempt: 0,
    stopped: false,
  };
  return g.__mesaVivaBus;
}

function dispatch(channel: string, msg: BusMessage) {
  const set = state().listeners.get(channel);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(msg);
    } catch (e) {
      console.error("[realtime] listener falló", e);
    }
  }
}

function broadcastResync() {
  for (const channel of state().listeners.keys()) dispatch(channel, { kind: "resync" });
}

function handleNotification(raw: string | undefined) {
  if (!raw) return;
  try {
    const msg = JSON.parse(raw) as { channel?: unknown; event?: unknown; payload?: unknown };
    if (typeof msg.channel !== "string" || !isRealtimeEvent(msg.event)) return;
    dispatch(msg.channel, { kind: "event", event: msg.event, payload: sanitizePayload(msg.payload) });
  } catch (e) {
    console.error("[realtime] notificación inválida", e);
  }
}

function scheduleReconnect() {
  const s = state();
  if (s.stopped || s.retryTimer || s.connecting) return;
  const delay = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** s.attempt);
  s.attempt++;
  s.retryTimer = setTimeout(() => {
    s.retryTimer = null;
    void ensureConnected().catch(() => {});
  }, delay);
  s.retryTimer.unref?.();
}

function onClientLost(client: Client, reason: unknown) {
  const s = state();
  if (s.client !== client) return; // ya gestionado
  s.client = null;
  client.removeAllListeners("notification");
  client.end().catch(() => {});
  if (!s.stopped) {
    console.warn("[realtime] conexión LISTEN perdida; reconectando", reason instanceof Error ? reason.message : "");
    scheduleReconnect();
  }
}

/** Conecta (si hace falta) y resuelve cuando el LISTEN está activo. */
export function ensureConnected(): Promise<void> {
  const s = state();
  if (s.client) return Promise.resolve();
  if (s.connecting) return s.connecting;
  s.stopped = false;
  if (s.retryTimer) {
    clearTimeout(s.retryTimer);
    s.retryTimer = null;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  // Sin handler de 'error' un fallo de red tumbaría el proceso.
  client.on("error", (e) => onClientLost(client, e));
  client.on("end", () => onClientLost(client, new Error("end")));
  client.on("notification", (n) => {
    if (n.channel === PG_CHANNEL) handleNotification(n.payload);
  });

  s.connecting = (async () => {
    try {
      await client.connect();
      await client.query(`LISTEN ${PG_CHANNEL}`);
      if (s.stopped) {
        await client.end().catch(() => {});
        return;
      }
      s.client = client;
      s.attempt = 0;
      broadcastResync();
    } catch (e) {
      client.removeAllListeners();
      client.on("error", () => {});
      await client.end().catch(() => {});
      console.error("[realtime] no se pudo conectar el bus", e instanceof Error ? e.message : e);
      throw e;
    } finally {
      s.connecting = null;
    }
  })();
  s.connecting.catch(() => scheduleReconnect());
  return s.connecting;
}

/**
 * Suscribe `fn` a un canal (`table:{id}`, `waiter:{id}`, `staff:floor`).
 * Conecta de forma perezosa en la primera suscripción. Devuelve la función para desuscribirse.
 */
export function subscribe(channel: string, fn: BusListener): () => void {
  const s = state();
  const set = s.listeners.get(channel) ?? new Set<BusListener>();
  set.add(fn);
  s.listeners.set(channel, set);
  void ensureConnected().catch(() => {});
  return () => {
    set.delete(fn);
    if (set.size === 0 && s.listeners.get(channel) === set) s.listeners.delete(channel);
  };
}

/** Solo tests/diagnóstico: pid del backend de Postgres de la conexión LISTEN. */
export async function getBusBackendPid(): Promise<number | null> {
  const client = state().client;
  if (!client) return null;
  const res = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  return res.rows[0]?.pid ?? null;
}

/** Solo tests: cierra la conexión, cancela reintentos y olvida a los suscriptores. */
export async function closeBusForTests(): Promise<void> {
  const s = state();
  s.stopped = true;
  if (s.retryTimer) clearTimeout(s.retryTimer);
  s.retryTimer = null;
  await s.connecting?.catch(() => {});
  const client = s.client;
  s.client = null;
  s.listeners.clear();
  s.attempt = 0;
  if (client) {
    client.removeAllListeners();
    client.on("error", () => {});
    await client.end().catch(() => {});
  }
}
