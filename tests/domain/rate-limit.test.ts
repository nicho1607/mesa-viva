import { describe, expect, it } from "vitest";
import { RateLimitError, createRateLimiter, enforceRateLimit, getRateLimiter } from "@/lib/rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("createRateLimiter (ventana deslizante)", () => {
  it("permite hasta el límite y luego rechaza con retryAfterMs", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    expect(rl.hit("a")).toEqual({ ok: true, remaining: 2 });
    c.advance(10_000);
    expect(rl.hit("a")).toEqual({ ok: true, remaining: 1 });
    expect(rl.hit("a")).toEqual({ ok: true, remaining: 0 });
    expect(rl.hit("a")).toEqual({ ok: false, retryAfterMs: 50_000 });
  });

  it("la ventana se desliza: el intento más antiguo caduca primero", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 2, windowMs: 1_000, now: c.now });
    rl.hit("a");
    c.advance(600);
    rl.hit("a");
    expect(rl.hit("a").ok).toBe(false);
    c.advance(400); // el primero (t=0) sale de la ventana
    expect(rl.hit("a").ok).toBe(true);
    expect(rl.hit("a").ok).toBe(false);
    c.advance(600); // sale el de t=600
    expect(rl.hit("a").ok).toBe(true);
  });

  it("los rechazos no alargan el bloqueo", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: c.now });
    rl.hit("a");
    for (let i = 0; i < 5; i++) {
      c.advance(100);
      expect(rl.hit("a").ok).toBe(false);
    }
    c.advance(500);
    expect(rl.hit("a").ok).toBe(true);
  });

  it("las llaves son independientes", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: clock().now });
    expect(rl.hit("a").ok).toBe(true);
    expect(rl.hit("b").ok).toBe(true);
    expect(rl.hit("a").ok).toBe(false);
  });

  it("barre llaves caducadas para no crecer sin límite", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: c.now, sweepEvery: 2 });
    rl.hit("a");
    rl.hit("b");
    c.advance(2_000);
    rl.hit("c"); // tamaño 3 > 2 → barre a y b
    // a vuelve a estar libre (además de por la ventana) y no hay errores
    expect(rl.hit("a").ok).toBe(true);
  });

  it("reset olvida todo", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: clock().now });
    rl.hit("a");
    rl.reset();
    expect(rl.hit("a").ok).toBe(true);
  });

  it("rechaza opciones inválidas", () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1 })).toThrow(RangeError);
    expect(() => createRateLimiter({ limit: 1, windowMs: 0 })).toThrow(RangeError);
  });
});

describe("enforceRateLimit / getRateLimiter", () => {
  it("lanza RateLimitError al superar el límite", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: clock().now });
    enforceRateLimit(rl, "a");
    try {
      enforceRateLimit(rl, "a");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).code).toBe("RATE_LIMITED");
      expect((e as RateLimitError).retryAfterMs).toBe(1_000);
    }
  });

  it("getRateLimiter devuelve la misma instancia por nombre (globalThis)", () => {
    const name = `t-${Math.random()}`;
    const a = getRateLimiter(name, { limit: 1, windowMs: 1_000 });
    const b = getRateLimiter(name, { limit: 99, windowMs: 1 });
    expect(a).toBe(b);
  });
});
