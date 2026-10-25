import { describe, expect, it } from "vitest";
import { decideTableAction } from "@/lib/domain/permissions";
import {
  formatClock,
  itemActions,
  newestFirst,
  parseTipPercent,
  percentLabel,
  roundActions,
  unservedCount,
} from "@/lib/table-view";

describe("roundActions / itemActions", () => {
  it("confirmar si hay pendientes; ronda servida si hay en cocina", () => {
    expect(roundActions([{ status: "PENDING", quantity: 1 }, { status: "IN_PREPARATION", quantity: 1 }])).toMatchObject({
      canConfirm: true,
      canServe: true,
    });
    expect(roundActions([{ status: "SERVED", quantity: 2 }, { status: "CANCELLED", quantity: 1 }])).toMatchObject({
      canConfirm: false,
      canServe: false,
    });
  });

  it("servido solo desde cocina; cancelar si no está servido", () => {
    expect(itemActions("PENDING")).toEqual({ canServe: false, canCancel: true });
    expect(itemActions("IN_PREPARATION")).toEqual({ canServe: true, canCancel: true });
    expect(itemActions("SERVED")).toEqual({ canServe: false, canCancel: false });
    expect(itemActions("CANCELLED")).toEqual({ canServe: false, canCancel: false });
  });
});

describe("unservedCount / newestFirst", () => {
  it("suma cantidades de PENDING e IN_PREPARATION", () => {
    const rounds = [
      { round: 1, items: [{ status: "SERVED", quantity: 2 }, { status: "PENDING", quantity: 3 }] },
      { round: 2, items: [{ status: "IN_PREPARATION", quantity: 1 }, { status: "CANCELLED", quantity: 4 }] },
    ];
    expect(unservedCount(rounds)).toBe(4);
    expect(newestFirst(rounds).map((r) => r.round)).toEqual([2, 1]);
    expect(rounds.map((r) => r.round)).toEqual([1, 2]); // sin mutar
  });
});

describe("parseTipPercent / percentLabel", () => {
  it("acepta enteros, coma o punto decimal y el signo %", () => {
    expect(parseTipPercent("10")).toBe(0.1);
    expect(parseTipPercent("12,5")).toBe(0.125);
    expect(parseTipPercent(" 7.5 % ")).toBe(0.075);
    expect(parseTipPercent("0")).toBe(0);
    expect(parseTipPercent("100")).toBe(1);
  });

  it("rechaza vacíos, negativos, > 100 y basura", () => {
    for (const bad of ["", "-5", "101", "abc", "1.234", "1e2"]) expect(parseTipPercent(bad)).toBeNull();
  });

  it("percentLabel muestra coma decimal", () => {
    expect(percentLabel(0.1)).toBe("10");
    expect(percentLabel(0.125)).toBe("12,5");
    expect(percentLabel(0.19)).toBe("19");
  });
});

describe("formatClock", () => {
  it("usa la hora de Bogotá (UTC-5)", () => {
    expect(formatClock("2026-10-25T19:05:00.000Z")).toBe("14:05");
  });
});

describe("decideTableAction", () => {
  const r = { orderWaiterId: "w-order", assignedWaiterId: "w-assigned" };
  it("ADMIN puede todo", () => {
    for (const a of ["view", "manage", "close"] as const) expect(decideTableAction({ id: "x", role: "ADMIN" }, r, a).ok).toBe(true);
  });
  it("CASHIER ve y cierra pero no gestiona", () => {
    const c = { id: "c", role: "CASHIER" };
    expect(decideTableAction(c, r, "view").ok).toBe(true);
    expect(decideTableAction(c, r, "close").ok).toBe(true);
    expect(decideTableAction(c, r, "manage")).toEqual({ ok: false, reason: "role" });
  });
  it("WAITER: mesero de la orden o asignado; otro no", () => {
    expect(decideTableAction({ id: "w-order", role: "WAITER" }, r, "manage").ok).toBe(true);
    expect(decideTableAction({ id: "w-assigned", role: "WAITER" }, r, "close").ok).toBe(true);
    expect(decideTableAction({ id: "otro", role: "WAITER" }, r, "view")).toEqual({ ok: false, reason: "not_responsible" });
  });
});
