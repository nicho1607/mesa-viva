"use client";

// Cuenta cerrada, lista para caja. Es lo único que se imprime (el resto lleva print:hidden).

import type { ClosedBillView } from "@/lib/domain/staff-table";
import { formatMoney } from "@/lib/money";
import { formatClock, percentLabel } from "@/lib/table-view";

type Props = { bill: ClosedBillView; tableNumber: number; zoneName: string; currency: string; pricesIncludeTax: boolean };

export function FinalBill({ bill, tableNumber, zoneName, currency, pricesIncludeTax }: Props) {
  const money = (c: number) => formatMoney(c, currency);
  return (
    <div className="mt-6">
      <p role="status" className="rounded-lg bg-albahaca px-4 py-3 text-lg font-bold text-white print:hidden">
        Servicio finalizado. La mesa quedó libre.
      </p>

      <article
        aria-labelledby="final-bill-title"
        className="mt-5 rounded-lg border border-tinta/20 bg-white px-5 py-6 print:mt-0 print:border-0 print:px-0"
      >
        <header className="border-b-2 border-dashed border-tinta/30 pb-4">
          <h2 id="final-bill-title" className="font-display text-3xl leading-none font-semibold [font-stretch:87.5%]">
            Cuenta, mesa <span className="tabular-nums">{tableNumber}</span>
          </h2>
          <p className="mt-2 text-tinta-suave">
            {zoneName}. Cerrada a las <span className="tabular-nums">{formatClock(bill.closedAt)}</span> por {bill.closedByName}.
          </p>
        </header>

        <ul className="py-3">
          {bill.lines.map((l, idx) => (
            <li key={`${l.productId}-${idx}`} className="py-1.5">
              <div className="flex items-baseline gap-2">
                <span className="w-9 shrink-0 font-bold tabular-nums">{l.quantity}×</span>
                <span className="min-w-0">{l.productName}</span>
                <span aria-hidden="true" className="mb-1 min-w-4 flex-1 self-end border-b-2 border-dotted border-tinta/20" />
                <span className="whitespace-nowrap tabular-nums">{money(l.lineTotal)}</span>
              </div>
              {l.notes ? <p className="pl-11 text-sm text-tinta-suave">{l.notes}</p> : null}
            </li>
          ))}
        </ul>

        <dl className="border-t-2 border-dashed border-tinta/30 pt-3 text-lg tabular-nums">
          <Row label="Subtotal" value={money(bill.subtotal)} />
          {pricesIncludeTax ? (
            <Row label={`IVA incluido (${percentLabel(bill.taxRate)} %)`} value={money(bill.taxAmount)} muted />
          ) : (
            <Row label={`IVA (${percentLabel(bill.taxRate)} %)`} value={money(bill.taxAmount)} />
          )}
          <Row label={`Propina (${percentLabel(bill.tipRate)} %)`} value={money(bill.tipAmount)} />
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t-4 border-double border-tinta pt-2">
            <dt className="font-display text-2xl font-semibold [font-stretch:87.5%]">Total a pagar</dt>
            <dd className="font-display text-4xl leading-none font-semibold tracking-tight">{money(bill.total)}</dd>
          </div>
        </dl>
      </article>

      <button
        type="button"
        onClick={() => window.print()}
        className="mt-5 min-h-13 w-full rounded-xl bg-tinta px-5 text-lg font-bold text-plato hover:bg-tinta/90 sm:w-auto print:hidden"
      >
        Imprimir cuenta
      </button>
    </div>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 py-0.5 ${muted ? "text-tinta-suave" : ""}`}>
      <dt>{label}</dt>
      <span aria-hidden="true" className="mb-1 min-w-4 flex-1 self-end border-b-2 border-dotted border-tinta/20" />
      <dd className="whitespace-nowrap">{value}</dd>
    </div>
  );
}
