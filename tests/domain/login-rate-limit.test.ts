import { beforeEach, expect, it } from "vitest";
import { allowLoginAttempt } from "@/lib/login-rate-limit";
import { resetRateLimitsForTests } from "@/lib/rate-limit";

beforeEach(resetRateLimitsForTests);

it("bloquea una cuenta normalizando espacios y mayúsculas", () => {
  for (let i = 0; i < 10; i++) expect(allowLoginAttempt("  ADMIN@example.test ")).toBe(true);
  expect(allowLoginAttempt("admin@example.test")).toBe(false);
  expect(allowLoginAttempt("otro@example.test")).toBe(true);
});

it("limita también los intentos que rotan de cuenta", () => {
  for (let i = 0; i < 100; i++) expect(allowLoginAttempt(`user${i}@example.test`)).toBe(true);
  expect(allowLoginAttempt("otra@example.test")).toBe(false);
});
