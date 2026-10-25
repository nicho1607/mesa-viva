import type { Metadata } from "next";
import { PrintButton } from "@/components/admin/PrintButton";
import { sectionTitle } from "@/components/admin/styles";
import { requireAdminPage } from "@/lib/auth";
import { getQrTables } from "@/lib/domain/admin";

export const metadata: Metadata = { title: "Códigos QR · Administración · Mesa Viva" };

// Hoja imprimible: una tarjeta por mesa activa. Al imprimir se ocultan cabecera y navegación.
export default async function AdminQrPage() {
  const user = await requireAdminPage();
  const tables = await getQrTables(user);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h2 className={sectionTitle}>Códigos QR</h2>
          <p className="max-w-prose text-tinta-suave">
            Un código por mesa activa. Si rotas el código de una mesa, imprime de nuevo su tarjeta.
          </p>
        </div>
        <PrintButton />
      </div>
      {tables.length === 0 ? (
        <p className="text-tinta-suave">No hay mesas activas.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-3">
          {tables.map((t) => (
            <li
              key={t.id}
              className="flex break-inside-avoid flex-col items-center gap-2 rounded-lg border-2 border-dashed border-tinta/40 bg-white px-4 py-5 text-center print:rounded-none"
            >
              <p className="font-display text-4xl font-semibold leading-none tracking-tight [font-stretch:75%]">
                Mesa {t.number}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element -- PNG dinámico y protegido, sin optimizar */}
              <img
                src={`/api/qr/${t.id}`}
                alt={`Código QR de la mesa ${t.number}`}
                width={220}
                height={220}
                className="size-[220px] print:size-[180px]"
              />
              <p className="max-w-[24ch] font-bold">Escanea para ver el menú y pedir</p>
              <p className="text-sm text-tinta-suave">{t.zone.name}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
