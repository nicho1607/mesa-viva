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
import { getAdminUsers } from "@/lib/domain/admin";
import { ROLE_LABEL } from "@/lib/floor-view";

export const metadata: Metadata = { title: "Equipo · Administración · Mesa Viva" };

const ROLE_OPTIONS = [
  { value: "WAITER", label: ROLE_LABEL.WAITER },
  { value: "CASHIER", label: ROLE_LABEL.CASHIER },
  { value: "ADMIN", label: ROLE_LABEL.ADMIN },
];

export default async function AdminTeamPage() {
  const me = await requireAdminPage();
  const users = await getAdminUsers(me);

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="team" className="flex flex-col gap-3">
        <h2 id="team" className={sectionTitle}>
          Equipo
        </h2>
        <ul className="divide-y divide-tinta/12 border-y border-tinta/12">
          {users.map((u) => (
            <li key={u.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-56">
                  <p className={`font-bold ${u.active ? "" : "text-tinta-suave"}`}>
                    {u.name}
                    {u.id === me.id ? <span className="font-normal text-tinta-suave"> (tú)</span> : null}
                  </p>
                  <p className="break-all text-sm text-tinta-suave">{u.email}</p>
                  <p className="text-sm">{ROLE_LABEL[u.role] ?? u.role}</p>
                </div>
                <ToggleForm
                  intent="user.active"
                  id={u.id}
                  field="active"
                  value={u.active}
                  onLabel="Activo"
                  offLabel="Inactivo"
                  itemLabel={u.name}
                  disabledReason={u.id === me.id ? "No puedes desactivar tu propia cuenta." : undefined}
                />
              </div>
              <Disclosure summary="Cambiar contraseña" className="w-fit open:w-full">
                <AdminForm intent="user.password" hidden={{ id: u.id }} closeOnSuccess className="flex max-w-sm flex-col gap-3">
                  <Field
                    name="password"
                    label={`Nueva contraseña para ${u.name}`}
                    type="password"
                    autoComplete="new-password"
                    hint="Mínimo 8 caracteres. Compártela en persona."
                  />
                  <FormStatus />
                  <SubmitButton className="w-fit">Cambiar contraseña</SubmitButton>
                </AdminForm>
              </Disclosure>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="new-user" className="flex flex-col gap-3">
        <h2 id="new-user" className={sectionTitle}>
          Nueva cuenta
        </h2>
        <AdminForm intent="user.create" className="flex max-w-2xl flex-col gap-3" aria-label="Nueva cuenta">
          <div className="flex flex-wrap items-start gap-3">
            <Field name="name" label="Nombre" autoComplete="off" className="min-w-0 flex-1 basis-56" />
            <Field
              name="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="off"
              className="min-w-0 flex-1 basis-56"
            />
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <SelectField name="role" label="Rol" options={ROLE_OPTIONS} defaultValue="WAITER" className="w-48" />
            <Field
              name="password"
              label="Contraseña inicial"
              type="password"
              autoComplete="new-password"
              hint="Mínimo 8 caracteres."
              className="min-w-0 flex-1 basis-56"
            />
          </div>
          <FormStatus />
          <SubmitButton className="w-fit" pendingLabel="Creando…">
            Crear cuenta
          </SubmitButton>
        </AdminForm>
      </section>
    </div>
  );
}
