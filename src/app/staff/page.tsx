import { logout } from "@/app/actions/staff.actions";
import { requireStaff } from "@/lib/auth";

// Placeholder: el panel real de mesas llega en MV-010.
export default async function StaffHomePage() {
  const user = await requireStaff();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold">Hola, {user.name}</h1>
        <form action={logout}>
          <button
            type="submit"
            className="min-h-11 rounded-md border-2 border-tinta px-4 font-bold text-tinta hover:bg-tinta hover:text-plato"
          >
            Cerrar sesión
          </button>
        </form>
      </header>
      <p className="text-tinta-suave">Aquí verás tus mesas y los pedidos en cuanto lleguen.</p>
    </main>
  );
}
