import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "@/app/actions/staff.actions";
import { FloorBoard } from "@/components/staff/FloorBoard";
import { requireStaff, type StaffUser } from "@/lib/auth";
import { getFloorForStaff } from "@/lib/domain/floor";
import { ROLE_LABEL } from "@/lib/floor-view";

export const metadata: Metadata = { title: "Mesas · Mesa Viva" };

async function loadFloor(user: StaffUser) {
  const zones = await getFloorForStaff(user);
  // Hora del servidor: reloj inicial de "hace n min" (mismo valor al hidratar).
  return { zones, now: Date.now() };
}

// Plano de mesas del personal: mesero → sus mesas; admin/caja → todo el salón.
export default async function StaffHomePage() {
  const user = await requireStaff();
  const { zones, now } = await loadFloor(user);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-28 pt-5 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-3">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight [font-stretch:87.5%]">
            {user.name}
          </h1>
          <p className="text-tinta-suave">{ROLE_LABEL[user.role] ?? user.role}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.role === "ADMIN" ? (
            <Link
              href="/staff/admin"
              className="inline-flex min-h-11 items-center rounded-md bg-tinta px-4 font-bold text-plato hover:bg-tinta/90"
            >
              Administración
            </Link>
          ) : null}
          <form action={logout}>
            <button
              type="submit"
              className="min-h-11 rounded-md border-2 border-tinta px-4 font-bold text-tinta hover:bg-tinta hover:text-plato"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <FloorBoard initialZones={zones} serverNow={now} isWaiter={user.role === "WAITER"} />
    </main>
  );
}
