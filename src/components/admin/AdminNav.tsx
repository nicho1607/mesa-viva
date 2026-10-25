"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/staff/admin/menu", label: "Menú" },
  { href: "/staff/admin/mesas", label: "Mesas y zonas" },
  { href: "/staff/admin/equipo", label: "Equipo" },
  { href: "/staff/admin/qr", label: "Códigos QR" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Administración" className="-mx-4 overflow-x-auto px-4 print:hidden sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-tinta/15">
        {LINKS.map((l) => {
          const current = path === l.href || path.startsWith(`${l.href}/`);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center border-b-[3px] px-3 font-bold ${
                  current ? "border-tinta text-tinta" : "border-transparent text-tinta-suave hover:text-tinta"
                }`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
