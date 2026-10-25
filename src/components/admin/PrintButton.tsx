"use client";

import { btn } from "./styles";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={btn.primary}>
      Imprimir
    </button>
  );
}
