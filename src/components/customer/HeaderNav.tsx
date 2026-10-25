"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** En el menú enlaza a "Mi cuenta"; dentro de la cuenta, de vuelta al menú. */
export function HeaderNav({ token }: { token: string }) {
  const pathname = usePathname();
  const base = `/m/${token}`;
  const onBill = pathname?.startsWith(`${base}/cuenta`);
  return (
    <Link
      href={onBill ? base : `${base}/cuenta`}
      className="-mr-2 inline-flex min-h-11 items-center rounded-md px-2 font-bold text-tinta underline decoration-tinta/40 decoration-2 underline-offset-4 hover:decoration-tinta"
    >
      {onBill ? "Volver al menú" : "Mi cuenta"}
    </Link>
  );
}
