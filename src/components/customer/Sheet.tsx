"use client";

// Hoja inferior accesible sobre <dialog> nativo con showModal(): el resto de la página queda
// inerte (trampa de foco), Esc cierra (evento cancel) y el foco vuelve al disparador.
// Toque en el fondo también cierra. La animación de entrada se desactiva con reduced motion.

import { useId, useLayoutEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Texto bajo el título (opcional). */
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function Sheet({ open, onClose, title, subtitle, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useLayoutEffect(() => {
    const dialog = ref.current;
    const body = bodyRef.current;
    const viewport = window.visualViewport;
    if (!open || !dialog || !body || !viewport) return;

    let frame = 0;

    const syncViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (viewport.scale !== 1) {
          dialog.style.removeProperty("--mv-sheet-bottom");
          dialog.style.removeProperty("--mv-sheet-height");
          return;
        }

        // Las barras de iOS también reducen el área visible sin enfocar un campo.
        const bottom = Math.max(0, document.documentElement.clientHeight - viewport.height - viewport.offsetTop);
        dialog.style.setProperty("--mv-sheet-bottom", `${bottom}px`);
        dialog.style.setProperty("--mv-sheet-height", `${viewport.height}px`);

        const field = document.activeElement;
        if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)
          || !body.contains(field)) return;

        const bounds = body.getBoundingClientRect();
        const fieldBounds = field.getBoundingClientRect();
        if (fieldBounds.top < bounds.top || fieldBounds.height > bounds.height) {
          body.scrollTop += fieldBounds.top - bounds.top - 8;
        } else if (fieldBounds.bottom > bounds.bottom) {
          body.scrollTop += fieldBounds.bottom - bounds.bottom + 8;
        }
      });
    };

    syncViewport();
    viewport.addEventListener("resize", syncViewport);
    viewport.addEventListener("scroll", syncViewport);
    dialog.addEventListener("focusin", syncViewport);
    dialog.addEventListener("focusout", syncViewport);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", syncViewport);
      viewport.removeEventListener("scroll", syncViewport);
      dialog.removeEventListener("focusin", syncViewport);
      dialog.removeEventListener("focusout", syncViewport);
      dialog.style.removeProperty("--mv-sheet-bottom");
      dialog.style.removeProperty("--mv-sheet-height");
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={(e) => {
        if (open && !e.currentTarget.open) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="mv-sheet fixed inset-x-0 top-auto bottom-[var(--mv-sheet-bottom,0px)] m-0 mx-auto hidden max-h-[min(92dvh,var(--mv-sheet-height,92dvh))] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white p-0 text-tinta shadow-[0_-1px_0_rgb(29_43_74/0.12)] backdrop:bg-tinta/55 open:flex"
    >
      <div className="flex items-start gap-3 border-b border-tinta/10 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-display text-2xl leading-tight font-semibold [font-stretch:87.5%]">
            {title}
          </h2>
          {subtitle ? <div className="mt-1 text-tinta-suave">{subtitle}</div> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-tinta hover:bg-tinta/5"
          aria-label="Cerrar"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      {footer ? (
        <div className="border-t border-tinta/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
      ) : null}
    </dialog>
  );
}
