import { describe, expect, it } from "vitest";
import pkg from "@/../package.json";

describe("scaffold", () => {
  it("resuelve el alias @/ y ejecuta Vitest", () => {
    expect(pkg.name).toBe("mesa-viva");
  });
});
