import type { Metadata } from "next";
import { connection } from "next/server";
import { HeaderNav } from "@/components/customer/HeaderNav";
import { getCustomerTable } from "@/lib/customer-table";

export async function generateMetadata({ params }: LayoutProps<"/m/[token]">): Promise<Metadata> {
  const { token } = await params;
  const table = await getCustomerTable(token);
  return { title: table ? `Mesa ${table.number} · Mesa Viva` : "Código no válido · Mesa Viva" };
}

export default async function CustomerLayout({ children, params }: LayoutProps<"/m/[token]">) {
  await connection();
  const { token } = await params;
  const table = await getCustomerTable(token);

  if (!table) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-16 pb-12">
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight [font-stretch:87.5%]">
          Este código no es válido, pide ayuda al mesero
        </h1>
        <p className="mt-3 text-lg text-tinta-suave">
          Puede que el código QR esté dañado o sea de otra mesa. Tu mesero te puede tomar el pedido o darte un código nuevo.
        </p>
      </main>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4">
      <header className="flex items-center justify-between gap-4 pt-5 pb-3">
        <p className="font-display text-[2rem] leading-none font-semibold tracking-tight [font-stretch:87.5%]">
          Mesa {table.number}
        </p>
        <HeaderNav token={token} />
      </header>
      {children}
    </div>
  );
}
