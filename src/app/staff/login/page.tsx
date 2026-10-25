import type { Metadata } from "next";
import { LoginForm } from "@/components/staff/LoginForm";
import { sanitizeNextPath } from "@/lib/session";

export const metadata: Metadata = { title: "Iniciar sesión · Mesa Viva" };

export default async function StaffLoginPage({ searchParams }: PageProps<"/staff/login">) {
  const { next } = await searchParams;
  const safeNext = sanitizeNextPath(Array.isArray(next) ? next[0] : next);

  return (
    <main className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center">
      <div className="w-full max-w-sm">
        {/* La comanda: borde superior dentado como el ticket del riel de cocina. */}
        <div
          aria-hidden="true"
          className="h-2.5 w-full"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='10'%3E%3Cpath d='M0 10 L8 0 L16 10 Z' fill='white'/%3E%3C/svg%3E\")",
            backgroundRepeat: "repeat-x",
            backgroundSize: "16px 100%",
          }}
        />
        <section className="bg-white px-6 pb-8 pt-4 shadow-[0_1px_0_var(--tinta-suave)]">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Mesa Viva</h1>
          <p className="mt-1 text-tinta-suave">Entra con tu cuenta de personal para ver tus mesas.</p>
          <hr className="my-6 border-0 border-t-2 border-dashed border-tinta-suave/40" />
          <LoginForm next={safeNext === "/staff" ? undefined : safeNext} />
        </section>
      </div>
    </main>
  );
}
