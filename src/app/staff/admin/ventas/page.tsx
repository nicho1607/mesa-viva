import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBillingSettings } from "@/lib/domain/billing";
import { getClosedSales, salesDateRange } from "@/lib/domain/sales";
import { formatMoney } from "@/lib/money";

const timeZone = "America/Bogota";
const calendar = new Intl.DateTimeFormat("sv-SE", { timeZone, dateStyle: "short" });
const timestamp = new Intl.DateTimeFormat("es-CO", {
  timeZone,
  dateStyle: "short",
  timeStyle: "short",
});

export default async function SalesPage({ searchParams }: PageProps<"/staff/admin/ventas">) {
  await requireAdminPage();
  const { desde, hasta } = await searchParams;
  const today = calendar.format(new Date());
  const from = desde === undefined && hasta === undefined ? today : desde;
  const to = desde === undefined && hasta === undefined ? today : hasta;
  const range = salesDateRange(from, to);
  const [sales, currencySetting] = range
    ? await Promise.all([getClosedSales(range), db.setting.findUnique({ where: { key: "currency" } })])
    : [[], null];
  const { currency } = parseBillingSettings(currencySetting ? [currencySetting] : []);
  const total = sales.reduce((sum, sale) => sum + sale.total, 0);

  return (
    <section className="space-y-5">
      <h2 className="font-display text-2xl font-semibold">Ventas</h2>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 font-bold">
          Desde
          <input type="date" name="desde" required defaultValue={typeof from === "string" ? from : ""}
            className="min-h-11 rounded-md border border-tinta/50 px-3 font-normal" />
        </label>
        <label className="grid gap-1 font-bold">
          Hasta
          <input type="date" name="hasta" required defaultValue={typeof to === "string" ? to : ""}
            className="min-h-11 rounded-md border border-tinta/50 px-3 font-normal" />
        </label>
        <button className="min-h-11 rounded-xl bg-tinta px-4 font-bold text-plato">Filtrar</button>
        <Link href="/staff/admin/ventas" className="inline-flex min-h-11 items-center px-2 underline">
          Volver a hoy
        </Link>
      </form>
      {range ? (
        <>
          <dl className="flex flex-wrap gap-6 tabular-nums">
            <div><dt>Cuentas cerradas</dt><dd className="text-xl font-bold">{sales.length}</dd></div>
            <div><dt>Total cobrado</dt><dd className="text-xl font-bold">{formatMoney(total, currency)}</dd></div>
          </dl>
          {sales.length === 0 ? <p>No hay ventas en este rango.</p> : (
            <table className="w-full text-left tabular-nums">
              <thead>
                <tr className="border-b border-tinta/20">
                  <th scope="col" className="py-2">Cierre</th>
                  <th scope="col">Mesa</th>
                  <th scope="col" className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(({ id, order, total }) => (
                  <tr key={id} className="border-b border-tinta/12">
                    <td className="py-2">{order.closedAt && timestamp.format(order.closedAt)}</td>
                    <td>{order.table.number}</td>
                    <td className="text-right">{formatMoney(total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <p role="alert" className="border-l-4 border-guindilla bg-guindilla/8 p-3">
          Ingresa dos fechas válidas. La fecha inicial debe ser igual o anterior a la final.
        </p>
      )}
    </section>
  );
}
