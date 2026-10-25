import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resolveAuthorizedChannel } from "@/lib/realtime/authorize";
import { closeBusForTests, ensureConnected, getBusBackendPid, subscribe, type BusMessage } from "@/lib/realtime/bus";
import { FLOOR_CHANNEL, tableChannel, waiterChannel } from "@/lib/realtime/events";
import { publish, publishOrderEvent } from "@/lib/realtime/publish";

const tag = randomBytes(4).toString("hex");

async function waitFor(cond: () => boolean, timeoutMs = 5_000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("timeout esperando condición");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function collect(channel: string) {
  const got: BusMessage[] = [];
  const unsub = subscribe(channel, (m) => got.push(m));
  return { got, unsub, events: () => got.filter((m) => m.kind === "event") };
}

afterEach(async () => {
  await closeBusForTests();
});

describe("bus LISTEN/NOTIFY", () => {
  it("un publish llega al suscriptor de su canal y no a otros canales", async () => {
    const a = collect(`table:a-${tag}`);
    const b = collect(`table:b-${tag}`);
    await ensureConnected();

    await publish(`table:a-${tag}`, "order.items_added", { orderId: "o1", version: 3, round: 2, tableNumber: 7 });
    await waitFor(() => a.events().length === 1);
    await delay(100);

    expect(a.events()[0]).toEqual({
      kind: "event",
      event: "order.items_added",
      payload: { orderId: "o1", version: 3, round: 2, tableNumber: 7 },
    });
    expect(b.got).toHaveLength(0);
  });

  it("elimina del payload todo lo que no esté en la whitelist", async () => {
    const a = collect(`table:w-${tag}`);
    await ensureConnected();

    const dirty = { orderId: "o2", version: 1, total: 99_000, items: [{ price: 1 }], tableNumber: "5" };
    // @ts-expect-error: campos no permitidos a propósito
    await publish(`table:w-${tag}`, "order.closed", dirty);
    await waitFor(() => a.events().length === 1);

    expect(a.events()[0]).toEqual({ kind: "event", event: "order.closed", payload: { orderId: "o2", version: 1 } });
  });

  it("ignora notificaciones con evento desconocido o JSON inválido", async () => {
    const a = collect(`table:x-${tag}`);
    await ensureConnected();
    await db.$executeRaw`SELECT pg_notify('mesa_viva', ${JSON.stringify({ channel: `table:x-${tag}`, event: "hack", payload: {} })})`;
    await db.$executeRaw`SELECT pg_notify('mesa_viva', 'no-json')`;
    await publish(`table:x-${tag}`, "waiter.called", { tableNumber: 3 });
    await waitFor(() => a.events().length >= 1);
    await delay(100);
    expect(a.events()).toEqual([{ kind: "event", event: "waiter.called", payload: { tableNumber: 3 } }]);
  });

  it("desuscribirse deja de recibir", async () => {
    const a = collect(`table:u-${tag}`);
    const keep = collect(`table:u-${tag}`);
    await ensureConnected();
    a.unsub();
    await publish(`table:u-${tag}`, "order.opened", { orderId: "o3" });
    await waitFor(() => keep.events().length === 1);
    await delay(100);
    expect(a.got).toHaveLength(0);
  });

  it("publishOrderEvent reparte a mesa, mesero y salón; sin mesero añade order.unassigned", async () => {
    const tableId = `t-${tag}`;
    const waiterId = `w-${tag}`;
    const table = collect(tableChannel(tableId));
    const waiter = collect(waiterChannel(waiterId));
    const floor = collect(FLOOR_CHANNEL);
    await ensureConnected();

    await publishOrderEvent({ tableId, waiterId, event: "order.opened", payload: { orderId: "o4", version: 1 } });
    await waitFor(() => table.events().length === 1 && waiter.events().length === 1 && floor.events().length === 1);
    expect(table.events()[0]).toMatchObject({ event: "order.opened", payload: { orderId: "o4", tableId, version: 1 } });

    await publishOrderEvent({ tableId, waiterId: null, event: "order.items_added", payload: { orderId: "o4", version: 2 } });
    await waitFor(() => floor.events().length === 3);
    await delay(100);
    expect(floor.events().map((m) => m.kind === "event" && m.event)).toEqual([
      "order.opened",
      "order.items_added",
      "order.unassigned",
    ]);
    expect(waiter.events()).toHaveLength(1);
  });

  it("publish no lanza aunque el evento sea inválido", async () => {
    // @ts-expect-error: evento fuera del contrato
    await expect(publish("table:z", "nope", {})).resolves.toBeUndefined();
  });

  it("reconecta tras perder la conexión LISTEN, avisa resync y sigue entregando", async () => {
    const a = collect(`table:r-${tag}`);
    await ensureConnected();
    const pid = await getBusBackendPid();
    expect(pid).toBeTypeOf("number");

    await db.$executeRaw`SELECT pg_terminate_backend(${pid}::int)`;
    await waitFor(() => a.got.some((m) => m.kind === "resync"), 10_000);
    const newPid = await getBusBackendPid();
    expect(newPid).not.toBe(pid);

    await publish(`table:r-${tag}`, "order.item_status_changed", { orderId: "o5", version: 9 });
    await waitFor(() => a.events().length === 1);
    expect(a.events()[0]).toMatchObject({ event: "order.item_status_changed", payload: { orderId: "o5", version: 9 } });
  });
});

describe("resolveAuthorizedChannel", () => {
  const f = { zoneId: "", tableId: "", token: "", inactiveToken: "", waiterId: "", adminId: "", inactiveId: "", ids: [] as string[] };

  beforeAll(async () => {
    const [waiter, admin, inactive] = await Promise.all([
      db.user.create({ data: { name: "Mesero rt", email: `rt-w-${tag}@test.local`, passwordHash: "x" } }),
      db.user.create({ data: { name: "Admin rt", email: `rt-a-${tag}@test.local`, passwordHash: "x", role: "ADMIN" } }),
      db.user.create({ data: { name: "Inactivo rt", email: `rt-i-${tag}@test.local`, passwordHash: "x", active: false } }),
    ]);
    f.waiterId = waiter.id;
    f.adminId = admin.id;
    f.inactiveId = inactive.id;
    f.zoneId = (await db.zone.create({ data: { name: `Zona rt ${tag}` } })).id;
    const base = 800_000 + (parseInt(tag, 16) % 90_000) * 10;
    f.token = `rt${tag}${randomBytes(10).toString("hex")}`;
    f.inactiveToken = `ri${tag}${randomBytes(10).toString("hex")}`;
    const t1 = await db.table.create({ data: { number: base + 1, publicToken: f.token, zoneId: f.zoneId } });
    const t2 = await db.table.create({
      data: { number: base + 2, publicToken: f.inactiveToken, zoneId: f.zoneId, status: "INACTIVE" },
    });
    f.tableId = t1.id;
    f.ids = [t1.id, t2.id];
  });

  afterAll(async () => {
    await db.table.deleteMany({ where: { id: { in: f.ids } } });
    await db.zone.deleteMany({ where: { id: f.zoneId } });
    await db.user.deleteMany({ where: { id: { in: [f.waiterId, f.adminId, f.inactiveId] } } });
  });

  const session = (sub: string, role: "WAITER" | "ADMIN" | "CASHIER") => ({ sub, role, name: "x" });

  it("token de mesa válido → table:{id}", async () => {
    expect(await resolveAuthorizedChannel({ tableToken: f.token, session: null })).toBe(tableChannel(f.tableId));
  });

  it("token inexistente, mal formado o de mesa INACTIVE → null", async () => {
    expect(await resolveAuthorizedChannel({ tableToken: `zz${randomUUID()}`, session: null })).toBeNull();
    expect(await resolveAuthorizedChannel({ tableToken: "'; DROP--", session: null })).toBeNull();
    expect(await resolveAuthorizedChannel({ tableToken: f.inactiveToken, session: null })).toBeNull();
  });

  it("mesero → waiter:{id}; admin → staff:floor; inactivo o sin sesión → null", async () => {
    expect(await resolveAuthorizedChannel({ tableToken: null, session: session(f.waiterId, "WAITER") })).toBe(
      waiterChannel(f.waiterId),
    );
    // El rol se toma de BD, no del JWT.
    expect(await resolveAuthorizedChannel({ tableToken: null, session: session(f.adminId, "WAITER") })).toBe(FLOOR_CHANNEL);
    expect(await resolveAuthorizedChannel({ tableToken: null, session: session(f.inactiveId, "WAITER") })).toBeNull();
    expect(await resolveAuthorizedChannel({ tableToken: null, session: session(randomUUID(), "ADMIN") })).toBeNull();
    expect(await resolveAuthorizedChannel({ tableToken: null, session: null })).toBeNull();
  });
});
