"use client";

import { useLanguage } from "./LanguageProvider";
import { TranslatedContent } from "./TranslatedContent";
import { customerError } from "@/lib/i18n";
import type { ActionError } from "@/lib/action-result";
import Link from "next/link";
import { useState } from "react";
import { cartCount, cartTotal, type CartLineView } from "@/lib/cart";
import { NoteField } from "./NoteField";
import { QuantityStepper } from "./QuantityStepper";
import { Sheet } from "./Sheet";

export type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; round: number }
  | { kind: "error"; code: string; details?: ActionError["details"] };

type Props = {
  open: boolean;
  onClose: () => void;
  token: string;
  lines: CartLineView[];
  send: SendState;
  onSend: () => void;
  onQuantity: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onNote: (key: string, note: string) => void;
};

export function CartSheet({ open, onClose, token, lines, send, onSend, onQuantity, onRemove, onNote }: Props) {
  const { t, money, locale } = useLanguage();
  const count = cartCount(lines);
  const total = cartTotal(lines);
  const productName = (productId: string) => {
    const line = lines.find((item) => item.productId === productId);
    return locale === "en" && line?.nameEn ? line.nameEn : (line?.name ?? (locale === "en" ? "this dish" : "este plato"));
  };

  if (send.kind === "sent") {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={t("sentTitle", { round: send.round })}
        footer={
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-13 w-full items-center justify-center rounded-xl border-2 border-tinta px-5 text-lg font-bold text-tinta"
          >
            {t("keepOrdering")}
          </button>
        }
      >
        <div role="status" className="flex gap-3">
          <span aria-hidden="true" className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-albahaca text-white">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="text-lg">{t("sentHelp")}</p>
            <Link
              href={`/m/${token}/cuenta`}
              className="mt-3 inline-flex min-h-11 items-center font-bold text-tinta underline decoration-2 underline-offset-4"
            >
              {t("viewBill")}
            </Link>
          </div>
        </div>
      </Sheet>
    );
  }

  const sending = send.kind === "sending";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("yourOrder")}
      subtitle={lines.length ? t(count === 1 ? "pendingOne" : "pendingMany", { count }) : undefined}
      footer={
        lines.length ? (
          <div className="flex flex-col gap-3">
            {send.kind === "error" ? (
              <div role="alert" className="rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2 text-tinta">
                <p>{customerError(locale, send, productName)}</p>
                {(send.details?.shortages?.length ?? 0) > 1 ? (
                  <ul className="mt-1 list-disc pl-5">
                    {send.details!.shortages!.map((shortage) => (
                      <li key={shortage.productId}>
                        {t("stockDetail", {
                          name: productName(shortage.productId),
                          requested: shortage.requested,
                          available: shortage.available,
                        })}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-3">
              <span>
                <span className="font-bold">{t("estimated")}</span>
                <span className="block text-sm text-tinta-suave">{t("finalHelp")}</span>
              </span>
              <span className="font-display text-2xl font-semibold tabular-nums">{money(total)}</span>
            </div>
            <button
              type="button"
              onClick={onSend}
              disabled={sending || count === 0}
              aria-disabled={sending || count === 0}
              className="flex min-h-13 w-full items-center justify-center rounded-xl bg-tinta px-5 text-lg font-bold text-plato hover:bg-[#25365c] disabled:bg-tinta/45"
            >
              {t(sending ? "sending" : "send")}
            </button>
          </div>
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <div className="py-6">
          <p className="text-lg">{t("emptyCart")}</p>
          <p className="mt-1 text-tinta-suave">{t("emptyCartHelp")}</p>
        </div>
      ) : (
        <ul className="-mt-4">
          {lines.map((l) => (
            <CartLineItem
              key={l.key}
              line={l}
              disabled={sending}
              onQuantity={onQuantity}
              onRemove={onRemove}
              onNote={onNote}
            />
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function CartLineItem({
  line: l,
  disabled,
  onQuantity,
  onRemove,
  onNote,
}: {
  line: CartLineView;
  disabled: boolean;
  onQuantity: Props["onQuantity"];
  onRemove: Props["onRemove"];
  onNote: Props["onNote"];
}) {
  const { t, money, locale } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(l.note);

  return (
    <li className="border-b border-tinta/12 py-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`font-display text-xl leading-snug font-semibold [font-stretch:87.5%] ${l.unavailable ? "text-tinta-suave" : ""}`}
        >
          <TranslatedContent original={l.name} english={l.nameEn} />
        </span>
        {l.unavailable ? null : (
          <span className="text-lg whitespace-nowrap tabular-nums">{money(l.unitPrice * l.quantity)}</span>
        )}
      </div>

      {l.unavailable ? (
        <p className="mt-1 font-bold text-guindilla">{t("unavailable")}</p>
      ) : l.note && !editing ? (
        <p className="mt-1 text-tinta-suave">{t("notePrefix", { note: l.note })}</p>
      ) : null}

      {editing ? (
        <div className="mt-3">
          <NoteField value={draft} onChange={setDraft} autoFocus />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onNote(l.key, draft);
                setEditing(false);
              }}
              className="min-h-11 rounded-lg bg-tinta px-4 font-bold text-plato"
            >
              {t("saveNote")}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(l.note);
                setEditing(false);
              }}
              className="min-h-11 rounded-lg px-4 text-tinta underline underline-offset-4"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
        {l.unavailable ? null : (
          <QuantityStepper
            value={l.quantity}
            onChange={(n) => onQuantity(l.key, n)}
            label={locale === "en" && l.nameEn ? l.nameEn : l.name}
          />
        )}
        {l.unavailable || editing ? null : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setDraft(l.note);
              setEditing(true);
            }}
            className="min-h-11 px-2 text-tinta underline underline-offset-4 disabled:text-tinta-suave"
          >
            {t(l.note ? "editNote" : "addNote")}
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRemove(l.key)}
          className="ml-auto min-h-11 px-2 text-guindilla underline underline-offset-4 disabled:text-tinta-suave"
          aria-label={t("removeItem", { name: locale === "en" && l.nameEn ? l.nameEn : l.name })}
        >
          {t("remove")}
        </button>
      </div>
    </li>
  );
}
