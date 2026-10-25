import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdminPage } from "@/lib/auth";

// Back-office: solo ADMIN (otros roles vuelven al salón). Cada página repite el chequeo.
export default async function AdminLayout({ children }: LayoutProps<"/staff/admin">) {
  const user = await requireAdminPage();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-20 pt-5 sm:px-6 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-3 print:hidden">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight [font-stretch:87.5%]">
            Administración
          </h1>
          <p className="text-tinta-suave">{user.name}</p>
        </div>
        <Link
          href="/staff"
          className="inline-flex min-h-11 items-center rounded-md border-2 border-tinta px-4 font-bold hover:bg-tinta hover:text-plato"
        >
          Volver al salón
        </Link>
      </header>
      <AdminNav />
      <main className="flex flex-1 flex-col pt-6 print:pt-0">{children}</main>
    </div>
  );
}
