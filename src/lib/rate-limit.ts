// Rate limit en memoria con ventana deslizante (por proceso; suficiente para un solo
// servidor). Puro salvo el registro global: el reloj es inyectable para los tests.

import { DomainError } from "@/lib/domain/errors";

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterMs: number };

export type RateLimiter = {
  /** Registra un intento para `key` y dice si está permitido. Los rechazados no cuentan. */
  hit(key: string): RateLimitResult;
  /** Olvida todos los intentos (tests). */
  reset(): void;
};

export type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** Cada cuántas llaves se barre la memoria de entradas caducadas. */
  sweepEvery?: number;
};

export class RateLimitError extends DomainError {
  readonly code = "RATE_LIMITED";
  constructor(public readonly retryAfterMs: number) {
    super("Estás enviando pedidos muy rápido. Espera un momento.");
  }
}

export function createRateLimiter({ limit, windowMs, now = Date.now, sweepEvery = 1_000 }: RateLimiterOptions): RateLimiter {
  if (!(limit >= 1) || !(windowMs > 0)) throw new RangeError("limit >= 1 y windowMs > 0");
  const hits = new Map<string, number[]>();

  function sweep(t: number) {
    for (const [k, list] of hits) {
      if (!list.length || list[list.length - 1] <= t - windowMs) hits.delete(k);
    }
  }

  return {
    hit(key) {
      const t = now();
      const fresh = (hits.get(key) ?? []).filter((ts) => ts > t - windowMs);
      if (fresh.length >= limit) {
        hits.set(key, fresh);
        return { ok: false, retryAfterMs: Math.max(1, fresh[0] + windowMs - t) };
      }
      fresh.push(t);
      hits.set(key, fresh);
      if (hits.size > sweepEvery) sweep(t);
      return { ok: true, remaining: limit - fresh.length };
    },
    reset() {
      hits.clear();
    },
  };
}

// Registro global (sobrevive a HMR en dev, igual que el cliente de Prisma).
const g = globalThis as unknown as { __mvRateLimiters?: Map<string, RateLimiter> };

/** Limitador con nombre, compartido por todo el proceso. La primera llamada fija las opciones. */
export function getRateLimiter(name: string, opts: RateLimiterOptions): RateLimiter {
  g.__mvRateLimiters ??= new Map();
  let limiter = g.__mvRateLimiters.get(name);
  if (!limiter) {
    limiter = createRateLimiter(opts);
    g.__mvRateLimiters.set(name, limiter);
  }
  return limiter;
}

/** Lanza `RateLimitError` si `key` superó el límite. */
export function enforceRateLimit(limiter: RateLimiter, key: string): void {
  const r = limiter.hit(key);
  if (!r.ok) throw new RateLimitError(r.retryAfterMs);
}

/** Vacía todos los limitadores globales (solo tests). */
export function resetRateLimitsForTests(): void {
  g.__mvRateLimiters?.forEach((l) => l.reset());
}
