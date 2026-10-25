import { describe, expect, it } from "vitest";
import { needsAck, openedLabel, tileKind, toastFor } from "@/lib/floor-view";

describe("tileKind", () => {
  const order = (pendingCount: number) => ({ pendingCount });
  it("prioriza la llamada y distingue la cuenta", () => {
    expect(tileKind({ status: "NEEDS_ATTENTION", attentionReason: "bill", order: order(2) })).toBe("bill");
    expect(tileKind({ status: "NEEDS_ATTENTION", attentionReason: "assistance", order: null })).toBe("assistance");
    expect(tileKind({ status: "NEEDS_ATTENTION", attentionReason: null, order: null })).toBe("assistance");
  });
  it("ronda sin confirmar, ocupada, libre", () => {
    expect(tileKind({ status: "OCCUPIED", attentionReason: null, order: order(1) })).toBe("pending");
    expect(tileKind({ status: "OCCUPIED", attentionReason: null, order: order(0) })).toBe("occupied");
    expect(tileKind({ status: "AVAILABLE", attentionReason: null, order: null })).toBe("free");
  });
  it("solo las llamadas se atienden", () => {
    expect(needsAck("bill")).toBe(true);
    expect(needsAck("pending")).toBe(false);
  });
});

describe("openedLabel", () => {
  const t0 = Date.parse("2026-10-25T20:00:00Z");
  it("formatea minutos y horas", () => {
    expect(openedLabel("2026-10-25T20:00:00Z", t0 + 30_000)).toBe("Recién abierta");
    expect(openedLabel("2026-10-25T20:00:00Z", t0 + 25 * 60_000)).toBe("Hace 25 min");
    expect(openedLabel("2026-10-25T20:00:00Z", t0 + 65 * 60_000)).toBe("Hace 1 h 05 min");
    expect(openedLabel("2026-10-25T20:00:00Z", t0 - 60_000)).toBe("Recién abierta");
  });
});

describe("toastFor", () => {
  it("rondas y llamadas", () => {
    expect(toastFor("order.items_added", { tableNumber: 7, round: 3 })).toEqual({ text: "Mesa 7 · Ronda 3", tone: "round" });
    expect(toastFor("order.opened", { tableNumber: 2, round: 1 })?.text).toBe("Mesa 2 · Ronda 1");
    expect(toastFor("waiter.called", { tableNumber: 7 })).toEqual({ text: "Mesa 7 te llama", tone: "call" });
    expect(toastFor("waiter.called", { tableNumber: 7, reason: "bill" })?.text).toBe("Mesa 7 pide la cuenta");
  });
  it("sin aviso para otros eventos o sin número de mesa", () => {
    expect(toastFor("table.updated", { tableNumber: 7 })).toBeNull();
    expect(toastFor("order.unassigned", { tableNumber: 7 })).toBeNull();
    expect(toastFor("waiter.called", {})).toBeNull();
  });
});
