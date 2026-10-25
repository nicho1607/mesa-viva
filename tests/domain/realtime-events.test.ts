import { describe, expect, it } from "vitest";
import { isRealtimeEvent, sanitizePayload } from "@/lib/realtime/events";

describe("sanitizePayload", () => {
  it("conserva solo campos permitidos con su tipo", () => {
    expect(
      sanitizePayload({ orderId: "o", tableId: "t", tableNumber: 7, round: 3, version: 2, total: 1000, items: [] }),
    ).toEqual({ orderId: "o", tableId: "t", tableNumber: 7, round: 3, version: 2 });
    expect(sanitizePayload({ tableNumber: "7", round: Number.NaN })).toEqual({});
    expect(sanitizePayload(null)).toEqual({});
  });

  it("reason solo admite assistance | bill", () => {
    expect(sanitizePayload({ reason: "bill" })).toEqual({ reason: "bill" });
    expect(sanitizePayload({ reason: "assistance" })).toEqual({ reason: "assistance" });
    expect(sanitizePayload({ reason: "BILL" })).toEqual({});
    expect(sanitizePayload({ reason: 1 })).toEqual({});
  });

  it("table.updated es un evento del contrato", () => {
    expect(isRealtimeEvent("table.updated")).toBe(true);
    expect(isRealtimeEvent("table.deleted")).toBe(false);
  });
});
