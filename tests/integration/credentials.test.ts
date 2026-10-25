import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyCredentials } from "@/lib/credentials";
import { db } from "@/lib/db";

const tag = randomBytes(4).toString("hex");
const activeEmail = `login-${tag}@test.local`;
const inactiveEmail = `inactivo-${tag}@test.local`;
const ids: string[] = [];

beforeAll(async () => {
  const passwordHash = await bcrypt.hash("secreto123", 4);
  const [a, b] = await Promise.all([
    db.user.create({ data: { name: "Login test", email: activeEmail, passwordHash, role: "WAITER" } }),
    db.user.create({ data: { name: "Inactivo", email: inactiveEmail, passwordHash, active: false } }),
  ]);
  ids.push(a.id, b.id);
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

describe("verifyCredentials", () => {
  it("acepta email + contraseña correctos (email sin distinguir mayúsculas/espacios)", async () => {
    const user = await verifyCredentials(`  ${activeEmail.toUpperCase()} `, "secreto123");
    expect(user).toEqual({ id: ids[0], name: "Login test", role: "WAITER" });
  });

  it("rechaza contraseña incorrecta", async () => {
    expect(await verifyCredentials(activeEmail, "mal")).toBeNull();
  });

  it("rechaza email inexistente", async () => {
    expect(await verifyCredentials(`nadie-${tag}@test.local`, "secreto123")).toBeNull();
  });

  it("rechaza usuario inactivo aunque la contraseña sea correcta", async () => {
    expect(await verifyCredentials(inactiveEmail, "secreto123")).toBeNull();
  });
});
