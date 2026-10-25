import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="font-display text-5xl font-semibold text-tinta">Mesa Viva</h1>
      <p className="text-tinta-suave">Menú virtual y pedidos en tiempo real.</p>
      <Link
        href="/staff"
        className="inline-flex min-h-11 items-center rounded-md bg-tinta px-5 font-bold text-plato"
      >
        Acceso del personal
      </Link>
    </main>
  );
}
