"use client";

// La cuenta en vivo como comanda: un ticket con borde dentado arriba que crece ronda a ronda.
// "Señal + refetch": el SSE de la mesa invalida ["bill", token] y TanStack Query vuelve a pedir.
// Única animación: la ronda que llega en vivo se "imprime" (clip-path por pasos, ver globals.css);
// nunca en la carga inicial y desactivada con prefers-reduced-motion.

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getTableBill } from "@/app/actions/order.actions";
import type { BillItemView, BillRoundView, TableBillView } from "@/lib/domain/queries";
import type { MessageKey } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";
import { TranslatedContent } from "./TranslatedContent";
import { type CustomerStatus } from "@/lib/domain/order-status";
import { useRealtimeInvalidate } from "@/lib/realtime/use-channel";
import { CallWaiterButtons } from "./CallWaiterButtons";

const STATUS_KEYS = { IN_PREPARATION: "preparing", SERVED: "served", CLOSED: "closed" } as const;
const PAYMENT_KEYS = { CASH: "cash", CARD: "card", TRANSFER: "transfer", MIXED: "mixed" } as const;

type Props = { token: string; initialBill?: TableBillView };
type BillWithOrder = Extract<TableBillView, { order: object }>;

export function LiveBill({ token, initialBill }: Props) {
  const { t, locale } = useLanguage();
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["bill", token],
    queryFn: async () => {
      const r = await getTableBill(token);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    initialData: initialBill,
    refetchOnWindowFocus: true,
  });
  const { connected } = useRealtimeInvalidate(`/api/events?table=${encodeURIComponent(token)}`, [["bill", token]]);

  // "Reconectando…" solo después de haber conectado una vez (no en la primera apertura).
  const [everConnected, setEverConnected] = useState(false);
  if (connected && !everConnected) setEverConnected(true);

  // Rondas nuevas y cambios de estado: ajuste de estado durante el render (sin effects).
  const [track, setTrack] = useState<Track | null>(() => nextTrack(null, initialBill, locale));
  const next = nextTrack(track, data, locale);
  if (next !== track) setTrack(next);

  const live = (
    <p aria-live="polite" className="sr-only">
      {track?.announce?.rounds.map((round) => t("roundAdded", { round })).join(" ")}
      {track?.announce?.status ? (track.announce.status === "CLOSED" ? t("closedAnnouncement") : t("statusChanged", { status: t(STATUS_KEYS[track.announce.status]) })) : ""}
    </p>
  );

  if (!data) {
    return (
      <>
        {live}
        {isPending && !isError ? (
          <p className="py-10 text-lg text-tinta-suave">{t("loadingBill")}</p>
        ) : (
          <div className="py-10">
            <p role="alert" className="rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2 text-lg">
              {t("billError")}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="mt-4 min-h-11 rounded-lg border-2 border-tinta px-4 font-bold disabled:opacity-60"
            >
              {t(isFetching ? "retrying" : "retry")}
            </button>
          </div>
        )}
      </>
    );
  }

  const reconnecting = everConnected && !connected;

  if (!data.order) {
    return (
      <>
        {live}
        <div className="py-8">
          <p className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight [font-stretch:87.5%]">
            {t("noOrder")}
          </p>
          <p className="mt-2 text-lg text-tinta-suave">{t("noOrderHelp")}</p>
          <Link
            href={`/m/${token}`}
            className="mt-6 inline-flex min-h-13 items-center justify-center rounded-xl bg-tinta px-6 text-lg font-bold text-plato hover:bg-[#25365c]"
          >
            {t("viewMenu")}
          </Link>
          {reconnecting ? <ReconnectingNote /> : null}
        </div>
        <div className="mt-6">
          <CallWaiterButtons token={token} withBill={false} />
        </div>
      </>
    );
  }

  const closed = data.customerStatus === "CLOSED";
  return (
    <>
      {live}
      <Ticket bill={data} fresh={track?.fresh ?? []} reconnecting={reconnecting} />
      {closed ? null : (
        <div className="mt-8">
          <CallWaiterButtons token={token} withBill />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Seguimiento de rondas nuevas / estado (para animar y anunciar)
// ---------------------------------------------------------------------------

type Track = {
  sig: string;
  orderId: string | null;
  rounds: number[];
  status: CustomerStatus | null;
  /** Rondas que llegaron en vivo en la última actualización (se imprimen). */
  fresh: number[];
  announce: { rounds: number[]; status: CustomerStatus | null; locale: Locale } | null;
};

function nextTrack(prev: Track | null, bill: TableBillView | undefined, locale: Locale): Track | null {
  if (!bill) return prev;
  const orderId = bill.order?.id ?? null;
  const rounds = bill.order ? bill.order.rounds.map((r) => r.round) : [];
  const status = bill.order ? (bill as BillWithOrder).customerStatus : null;
  const sig = `${orderId}|${rounds.join(",")}|${status}`;
  if (prev && prev.sig === sig) return prev.announce && prev.announce.locale !== locale ? { ...prev, announce: null } : prev;
  if (!prev) return { sig, orderId, rounds, status, fresh: [], announce: null };

  const known = prev.orderId === orderId ? prev.rounds : [];
  const fresh = rounds.filter((r) => !known.includes(r));
  const changedStatus = status !== prev.status ? status : null;
  return { sig, orderId, rounds, status, fresh, announce: fresh.length || changedStatus ? { rounds: fresh, status: changedStatus, locale } : prev.announce };
}

// ---------------------------------------------------------------------------
// El ticket
// ---------------------------------------------------------------------------

const TEETH_UP =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='10'%3E%3Cpath d='M0 10 L8 0 L16 10 Z' fill='white'/%3E%3C/svg%3E\")";
const TEETH_DOWN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='10'%3E%3Cpath d='M0 0 L8 10 L16 0 Z' fill='white'/%3E%3C/svg%3E\")";

function Teeth({ image }: { image: string }) {
  return (
    <div
      aria-hidden="true"
      className="h-2.5 w-full"
      style={{ backgroundImage: image, backgroundRepeat: "repeat-x", backgroundSize: "16px 100%" }}
    />
  );
}

function Ticket({ bill, fresh, reconnecting }: { bill: BillWithOrder; fresh: number[]; reconnecting: boolean }) {
  const { t, money: formatMoney } = useLanguage();
  const { order, totals, customerStatus, currency, paymentMethod } = bill;
  const closed = customerStatus === "CLOSED";
  const money = (c: number) => formatMoney(c, currency);
  const taxPct = Math.round(totals.taxRate * 100);
  const tipPct = Math.round(totals.tipRate * 100);

  return (
    // drop-shadow sigue el contorno de los dientes (un box-shadow no lo haría).
    <article
      aria-labelledby="bill-title"
      className="[filter:drop-shadow(0_0_0.5px_rgb(29_43_74/0.45))_drop-shadow(0_3px_0_rgb(29_43_74/0.05))]"
    >
      <Teeth image={TEETH_UP} />
      <div className="bg-white px-4 pt-4 pb-6 sm:px-7">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2
            id="bill-title"
            className="font-display text-[1.75rem] leading-none font-semibold tracking-tight [font-stretch:87.5%]"
          >
            {t("yourBill")}
          </h2>
          <StatusPill status={customerStatus} />
        </header>
        {reconnecting ? <ReconnectingNote /> : null}

        {order.rounds.map((r) => (
          <Round key={r.round} round={r} money={money} fresh={fresh.includes(r.round)} />
        ))}

        <dl className="mt-6 border-t-2 border-dashed border-tinta/30 pt-4 text-base tabular-nums sm:text-lg">
          <TotalRow label={t("subtotal")} value={money(totals.subtotal)} />
          {totals.pricesIncludeTax ? (
            <TotalRow label={t("includedTax", { percent: taxPct })} value={money(totals.taxAmount)} muted />
          ) : (
            <TotalRow label={t("tax", { percent: taxPct })} value={money(totals.taxAmount)} />
          )}
          <TotalRow label={t("tip", { percent: tipPct })} value={money(totals.tipAmount)} />
          {paymentMethod ? <TotalRow label={t("payment")} value={t(PAYMENT_KEYS[paymentMethod])} /> : null}
          {paymentMethod === "MIXED" && bill.transferAmount !== null && bill.cashAmount !== null ? (
            <>
              <TotalRow label={t("transfer")} value={money(bill.transferAmount)} />
              <TotalRow label={t("cash")} value={money(bill.cashAmount)} />
            </>
          ) : null}
          <div className="mt-3 flex items-baseline justify-between gap-4 border-t-4 border-double border-tinta pt-3">
            <dt className="font-display text-2xl font-semibold [font-stretch:87.5%]">{t("total")}</dt>
            <dd className="font-display text-[2.5rem] leading-none font-semibold tracking-tight tabular-nums">
              {money(totals.total)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-tinta-suave">
          {totals.pricesIncludeTax ? t("taxHelp") : ""}{t("tipHelp")}
        </p>

        {closed ? (
          <p className="mt-6 border-t-2 border-dashed border-tinta/30 pt-5 text-center">
            <span className="block font-display text-xl font-semibold [font-stretch:87.5%]">{t("closed")}</span>
            <span className="block text-lg text-tinta-suave">{t("thanks")}</span>
          </p>
        ) : null}
      </div>
      {/* Abierta: el ticket sigue "en la impresora". Cerrada: arrancado, con dientes abajo. */}
      {closed ? <Teeth image={TEETH_DOWN} /> : null}
    </article>
  );
}

const PILL: Record<CustomerStatus, string> = {
  IN_PREPARATION: "bg-azafran text-tinta",
  SERVED: "bg-albahaca text-white",
  CLOSED: "bg-tinta text-plato",
};

function StatusPill({ status }: { status: CustomerStatus }) {
  const { t } = useLanguage();
  return (
    <p className={`inline-flex min-h-8 items-center rounded-full px-3.5 text-base font-bold ${PILL[status]}`}>
      <span className="sr-only">{t("status")}</span>
      {t(STATUS_KEYS[status])}
    </p>
  );
}

function ReconnectingNote() {
  const { t } = useLanguage();
  return (
    <p role="status" className="mt-3 flex items-center gap-2 text-sm text-tinta-suave">
      <span aria-hidden="true" className="size-2 rounded-full border-2 border-tinta-suave" />
      {t("reconnecting")}
    </p>
  );
}

function Round({ round, money, fresh }: { round: BillRoundView; money: (c: number) => string; fresh: boolean }) {
  const { t } = useLanguage();
  const headingId = `ronda-${round.round}`;
  return (
    <section aria-labelledby={headingId} className={`mt-6 ${fresh ? "mv-print" : ""}`}>
      <h3
        id={headingId}
        className="flex items-center gap-3 font-display text-lg font-semibold [font-stretch:87.5%]"
      >
        {fresh ? <span aria-hidden="true" className="h-4 w-1 rounded-full bg-azafran" /> : null}
        {t("round", { round: round.round })}
        <span aria-hidden="true" className="h-0 flex-1 border-t-2 border-dashed border-tinta/30" />
      </h3>
      <ul className="mt-1">
        {round.items.map((i) => (
          <ItemRow key={i.id} item={i} money={money} />
        ))}
      </ul>
    </section>
  );
}

const ITEM_MARK: Record<Exclude<BillItemView["status"], "CANCELLED">, { label: MessageKey; dot: string }> = {
  PENDING: { label: "pending", dot: "border-2 border-tinta-suave" },
  IN_PREPARATION: { label: "inKitchen", dot: "bg-azafran" },
  SERVED: { label: "itemServed", dot: "bg-albahaca" },
};

function ItemRow({ item: i, money }: { item: BillItemView; money: (c: number) => string }) {
  const { t } = useLanguage();
  const cancelled = i.status === "CANCELLED";
  const mark = i.status === "CANCELLED" ? null : ITEM_MARK[i.status];
  return (
    <li className="py-2.5">
      <div className="flex items-baseline gap-2">
        <span className={`w-8 shrink-0 tabular-nums ${cancelled ? "text-tinta-suave line-through" : "font-bold"}`}>
          {i.quantity}×
        </span>
        <span
          className={`font-display text-xl leading-snug font-semibold [font-stretch:87.5%] ${cancelled ? "text-tinta-suave line-through" : ""}`}
        >
          <TranslatedContent original={i.productName} english={i.productNameEn} />
        </span>
        <span aria-hidden="true" className="mb-1 min-w-4 flex-1 self-end border-b-2 border-dotted border-tinta/25" />
        {cancelled ? (
          <span className="font-bold whitespace-nowrap text-guindilla">{t("cancelled")}</span>
        ) : (
          <span className="text-lg whitespace-nowrap tabular-nums">{money(i.unitPrice * i.quantity)}</span>
        )}
      </div>
      <div className="pl-10">
        {mark ? (
          <p className="flex items-center gap-1.5 text-sm text-tinta-suave">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${mark.dot}`} />
            {t(mark.label)}
          </p>
        ) : null}
        {i.notes ? <p className="mt-0.5 text-tinta-suave">{i.notes}</p> : null}
      </div>
    </li>
  );
}

function TotalRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 py-1 ${muted ? "text-tinta-suave" : ""}`}>
      <dt>{label}</dt>
      <span aria-hidden="true" className="mb-1 min-w-4 flex-1 self-end border-b-2 border-dotted border-tinta/20" />
      <dd className="whitespace-nowrap">{value}</dd>
    </div>
  );
}
