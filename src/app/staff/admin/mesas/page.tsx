import type { Metadata } from "next";
import {
  AdminForm,
  Disclosure,
  Field,
  FormStatus,
  SelectField,
  SubmitButton,
  ToggleForm,
} from "@/components/admin/AdminForm";
import { sectionTitle } from "@/components/admin/styles";
import { requireAdminPage } from "@/lib/auth";
import { getAdminFloor, type AdminFloor } from "@/lib/domain/admin";

export const metadata: Metadata = { title: "Mesas y zonas · Administración · Mesa Viva" };

type Zone = AdminFloor["zones"][number];
type Table = Zone["tables"][number];
type Option = { value: string; label: string };

/** Opciones de mesero; si el asignado ya no está activo, se conserva para no perderlo al guardar. */
function waiterOptions(waiters: AdminFloor["waiters"], empty: string, current?: { id: string; name: string } | null): Option[] {
  const opts = [{ value: "", label: empty }, ...waiters.map((w) => ({ value: w.id, label: w.name }))];
  if (current && !waiters.some((w) => w.id === current.id)) {
    opts.push({ value: current.id, label: `${current.name} (inactivo)` });
  }
  return opts;
}

export default async function AdminTablesPage() {
  const user = await requireAdminPage();
  const { zones, waiters } = await getAdminFloor(user);
  const zoneOptions = zones.map((z) => ({ value: z.id, label: z.name }));

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="zones" className="flex flex-col gap-3">
        <h2 id="zones" className={sectionTitle}>
          Zonas
        </h2>
        <p className="max-w-prose text-tinta-suave">
          Cada zona tiene un mesero. Sus mesas le llegan a él, salvo las que tengan un mesero propio.
        </p>
        <ul className="divide-y divide-tinta/12 border-y border-tinta/12">
          {zones.map((z) => (
            <ZoneRow key={z.id} zone={z} waiters={waiters} />
          ))}
        </ul>
        <AdminForm intent="zone.create" className="flex flex-col gap-3" aria-label="Nueva zona">
          <div className="flex flex-wrap items-start gap-3">
            <Field name="name" label="Nueva zona" placeholder="Ej. Barra" className="min-w-0 flex-1 basis-48" />
            <SelectField
              name="waiterId"
              label="Mesero"
              options={waiterOptions(waiters, "Sin mesero")}
              defaultValue=""
              className="min-w-0 flex-1 basis-48"
            />
            <SubmitButton className="mt-7" pendingLabel="Creando…">
              Crear zona
            </SubmitButton>
          </div>
          <FormStatus />
        </AdminForm>
      </section>

      <section aria-labelledby="tables" className="flex flex-col gap-4">
        <h2 id="tables" className={sectionTitle}>
          Mesas
        </h2>
        {zones.length === 0 ? (
          <p className="text-tinta-suave">Crea una zona para empezar a agregar mesas.</p>
        ) : (
          <Disclosure summary="Nueva mesa" tone="primary">
            <TableForm intent="table.create" zoneOptions={zoneOptions} waiters={waiters} />
          </Disclosure>
        )}
        {zones.map((z) => (
          <div key={z.id} className="flex flex-col gap-1">
            <h3 className="pt-2 font-display text-lg font-semibold [font-stretch:87.5%]">{z.name}</h3>
            {z.tables.length === 0 ? (
              <p className="text-tinta-suave">Sin mesas.</p>
            ) : (
              <ul className="divide-y divide-tinta/12 border-y border-tinta/12">
                {z.tables.map((t) => (
                  <TableRow key={t.id} table={t} zone={z} zoneOptions={zoneOptions} waiters={waiters} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

function ZoneRow({ zone: z, waiters }: { zone: Zone; waiters: AdminFloor["waiters"] }) {
  const n = z.tables.length;
  const current = z.waiterId && z.waiter ? { id: z.waiterId, name: z.waiter.name } : null;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="font-bold">{z.name}</p>
        <p className="text-sm text-tinta-suave">
          {z.waiter ? `Mesero: ${z.waiter.name}` : "Sin mesero"}, {n} {n === 1 ? "mesa" : "mesas"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Disclosure summary="Editar" className="open:basis-full">
          <AdminForm intent="zone.update" hidden={{ id: z.id }} closeOnSuccess className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start gap-3">
              <Field name="name" label="Nombre" defaultValue={z.name} className="min-w-0 flex-1 basis-48" />
              <SelectField
                name="waiterId"
                label="Mesero"
                options={waiterOptions(waiters, "Sin mesero", current)}
                defaultValue={z.waiterId ?? ""}
                className="min-w-0 flex-1 basis-48"
              />
            </div>
            <FormStatus />
            <SubmitButton className="w-fit">Guardar zona</SubmitButton>
          </AdminForm>
        </Disclosure>
        <Disclosure summary="Eliminar" tone="danger" className="open:basis-full">
          <AdminForm intent="zone.delete" hidden={{ id: z.id }} className="flex flex-col gap-3">
            <p>
              {n > 0
                ? `Tiene ${n} ${n === 1 ? "mesa" : "mesas"}: muévelas a otra zona o elimínalas antes.`
                : `Se eliminará la zona "${z.name}".`}
            </p>
            <FormStatus />
            <SubmitButton variant="danger" pendingLabel="Eliminando…" className="w-fit">
              Eliminar zona
            </SubmitButton>
          </AdminForm>
        </Disclosure>
      </div>
    </li>
  );
}

function TableRow({
  table: t,
  zone,
  zoneOptions,
  waiters,
}: {
  table: Table;
  zone: Zone;
  zoneOptions: Option[];
  waiters: AdminFloor["waiters"];
}) {
  const open = t.orders.length > 0;
  const inactive = t.status === "INACTIVE";
  const who = t.waiter
    ? `${t.waiter.name} (asignado a la mesa)`
    : zone.waiter
      ? `${zone.waiter.name} (de la zona)`
      : "Sin mesero";
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className={`font-display text-xl font-semibold [font-stretch:87.5%] ${inactive ? "text-tinta-suave" : ""}`}>
              Mesa {t.number}
            </span>
            <span className="text-sm text-tinta-suave">{t.seats} puestos</span>
            {open ? (
              <span className="rounded-sm border border-azafran px-1.5 text-sm font-bold">Cuenta abierta</span>
            ) : null}
          </p>
          <p className="text-sm text-tinta-suave">Mesero: {who}</p>
        </div>
        <ToggleForm
          intent="table.active"
          id={t.id}
          field="active"
          value={!inactive}
          onLabel="Activa"
          offLabel="Inactiva"
          itemLabel={`Mesa ${t.number}`}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Disclosure summary="Editar" className="open:basis-full">
          <TableForm intent="table.update" table={t} zoneOptions={zoneOptions} waiters={waiters} />
        </Disclosure>
        <Disclosure summary="Rotar código QR" className="open:basis-full">
          <AdminForm intent="table.rotate" hidden={{ id: t.id }} className="flex flex-col gap-3">
            <p className="max-w-prose border-l-4 border-azafran bg-azafran/10 px-3 py-2">
              Se generará un código nuevo para la Mesa {t.number}. El QR impreso que está en la mesa dejará de
              funcionar al instante: imprime y coloca el nuevo.
            </p>
            <FormStatus />
            <SubmitButton pendingLabel="Rotando…" className="w-fit">
              Rotar código
            </SubmitButton>
          </AdminForm>
        </Disclosure>
        {t._count.orders === 0 ? (
          <Disclosure summary="Eliminar" tone="danger" className="open:basis-full">
            <AdminForm intent="table.delete" hidden={{ id: t.id }} className="flex flex-col gap-3">
              <p>Se eliminará la Mesa {t.number}. Nunca ha tenido cuentas.</p>
              <FormStatus />
              <SubmitButton variant="danger" pendingLabel="Eliminando…" className="w-fit">
                Eliminar mesa
              </SubmitButton>
            </AdminForm>
          </Disclosure>
        ) : null}
      </div>
    </li>
  );
}

function TableForm({
  intent,
  table: t,
  zoneOptions,
  waiters,
}: {
  intent: "table.create" | "table.update";
  table?: Table;
  zoneOptions: Option[];
  waiters: AdminFloor["waiters"];
}) {
  const current = t?.waiterId && t.waiter ? { id: t.waiterId, name: t.waiter.name } : null;
  return (
    <AdminForm
      intent={intent}
      hidden={t ? { id: t.id } : undefined}
      closeOnSuccess={!!t}
      className="flex max-w-2xl flex-col gap-3"
      aria-label={t ? `Editar mesa ${t.number}` : "Nueva mesa"}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Field
          name="number"
          label="Número"
          type="number"
          inputMode="numeric"
          defaultValue={t ? String(t.number) : undefined}
          className="w-28"
        />
        <Field
          name="seats"
          label="Puestos"
          type="number"
          inputMode="numeric"
          defaultValue={String(t?.seats ?? 4)}
          className="w-28"
        />
        <SelectField
          name="zoneId"
          label="Zona"
          options={zoneOptions}
          defaultValue={t?.zoneId ?? zoneOptions[0]?.value}
          className="min-w-0 flex-1 basis-40"
        />
      </div>
      <SelectField
        name="waiterId"
        label="Mesero de la mesa"
        options={waiterOptions(waiters, "Según la zona", current)}
        defaultValue={t?.waiterId ?? ""}
        className="max-w-sm"
      />
      <FormStatus />
      <SubmitButton className="w-fit" pendingLabel={t ? "Guardando…" : "Creando…"}>
        {t ? "Guardar mesa" : "Crear mesa"}
      </SubmitButton>
    </AdminForm>
  );
}
