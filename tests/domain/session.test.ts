import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { sanitizeNextPath, signSession, verifySession } from "@/lib/session";

const secret = "test-secret-de-al-menos-treinta-y-dos-caracteres";
const other = "otro-secreto-distinto-de-al-menos-32-caracteres!";
const payload = { sub: "user-1", role: "WAITER" as const, name: "Laura Gómez" };

describe("signSession / verifySession", () => {
  it("verifica un token válido y devuelve el payload", async () => {
    const token = await signSession(payload, { secret });
    expect(await verifySession(token, { secret })).toEqual(payload);
  });

  it("rechaza un token firmado con otro secreto", async () => {
    const token = await signSession(payload, { secret: other });
    expect(await verifySession(token, { secret })).toBeNull();
  });

  it("rechaza un token manipulado (payload cambiado)", async () => {
    const token = await signSession(payload, { secret });
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, role: "ADMIN" })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`, { secret })).toBeNull();
  });

  it("rechaza un token expirado", async () => {
    const token = await signSession(payload, { secret, now: Date.now() - 13 * 3600_000 });
    expect(await verifySession(token, { secret })).toBeNull();
  });

  it("expira a las 12 h", async () => {
    const token = await signSession(payload, { secret });
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(claims.exp - claims.iat).toBe(12 * 3600);
  });

  it("rechaza vacío, basura y alg none", async () => {
    expect(await verifySession(undefined, { secret })).toBeNull();
    expect(await verifySession("", { secret })).toBeNull();
    expect(await verifySession("no.es.jwt", { secret })).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
      JSON.stringify({ ...payload, exp: 9999999999 }),
    ).toString("base64url")}.`;
    expect(await verifySession(none, { secret })).toBeNull();
  });

  it("rechaza un rol desconocido aunque la firma sea válida", async () => {
    const token = await new SignJWT({ role: "ROOT", name: "x" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(secret));
    expect(await verifySession(token, { secret })).toBeNull();
  });

  it("exige un secreto de al menos 32 caracteres", async () => {
    await expect(signSession(payload, { secret: "corto" })).rejects.toThrow();
  });
});

describe("sanitizeNextPath", () => {
  it.each([
    ["/staff", "/staff"],
    ["/staff/mesas/3", "/staff/mesas/3"],
    ["/staff/mesas?zona=terraza#x", "/staff/mesas?zona=terraza#x"],
  ])("acepta %s", (input, expected) => {
    expect(sanitizeNextPath(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    "",
    "https://evil.com/staff",
    "//evil.com/staff",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "/admin",
    "/staffx",
    "/staff/../admin",
    "/staff/login",
    "/staff\n/x",
    "staff",
  ])("rechaza %s → /staff", (input) => {
    expect(sanitizeNextPath(input)).toBe("/staff");
  });
});
