"use client";

// Hoja inferior accesible sobre <dialog> nativo con showModal(): el resto de la página queda
// inerte (trampa de foco), Esc cierra (evento cancel) y el foco vuelve al disparador.
// Toque en el fondo también cierra. La animación de entrada se desactiva con reduced motion.

import { useEffect, useId, useRef, type ReactNode } from "react";

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
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
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
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="mv-sheet fixed inset-x-0 top-auto bottom-0 m-0 mx-auto hidden max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white p-0 text-tinta shadow-[0_-1px_0_rgb(29_43_74/0.12)] backdrop:bg-tinta/55 open:flex"
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      {footer ? (
        <div className="border-t border-tinta/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
      ) : null}
    </dialog>
  );
}
