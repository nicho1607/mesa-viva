import type { Metadata } from "next";
import Link from "next/link";
import { TableDetail } from "@/components/staff/TableDetail";
import { requireStaff } from "@/lib/auth";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { getTableDetailForStaff, type TableDetailView } from "@/lib/domain/staff-table";

export const metadata: Metadata = { title: "Mesa · Mesa Viva" };

type Load = { ok: true; detail: TableDetailView } | { ok: false; title: string; text: string };

async function load(user: { id: string; role: string }, id: string): Promise<Load> {
  try {
    return { ok: true, detail: await getTableDetailForStaff(user, id) };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, title: "Esta mesa no está asignada a ti.", text: "Pide a administración que te la asigne si debes atenderla." };
    }
    if (e instanceof NotFoundError) {
      return { ok: false, title: "No encontramos esta mesa.", text: "Puede que se haya eliminado. Vuelve al plano y elige otra." };
    }
    throw e;
  }
}

// Detalle de una mesa: rondas, estados de platos, agregar productos y finalizar servicio.
export default async function TableDetailPage({ params }: PageProps<"/staff/mesas/[id]">) {
  const user = await requireStaff();
  const { id } = await params;
  const r = await load(user, id);

  if (!r.ok) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-16 sm:px-6">
        <BackLink />
        <div className="mt-10 border-l-4 border-guindilla pl-4">
          <h1 className="font-display text-3xl font-semibold leading-tight [font-stretch:87.5%]">{r.title}</h1>
          <p className="mt-2 text-lg text-tinta-suave">{r.text}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-40 sm:px-6 print:p-0 print:pb-0">
      <div className="print:hidden">
        <BackLink />
      </div>
      <TableDetail tableId={id} initialDetail={r.detail} />
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/staff"
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 font-bold text-tinta hover:bg-tinta/5"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Plano de mesas
    </Link>
  );
}
