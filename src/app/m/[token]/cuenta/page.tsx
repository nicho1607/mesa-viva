import type { Metadata } from "next";
import { connection } from "next/server";
import { getTableBill } from "@/app/actions/order.actions";
import { LiveBill } from "@/components/customer/LiveBill";
import { getCustomerTable } from "@/lib/customer-table";

export async function generateMetadata({ params }: PageProps<"/m/[token]/cuenta">): Promise<Metadata> {
  const { token } = await params;
  const table = await getCustomerTable(token);
  return { title: table ? `Cuenta · Mesa ${table.number} · Mesa Viva` : "Código no válido · Mesa Viva" };
}

export default async function CustomerBillPage({ params }: PageProps<"/m/[token]/cuenta">) {
  await connection();
  const { token } = await params;
  // El layout ya muestra el mensaje de código no válido.
  const table = await getCustomerTable(token);
  if (!table) return null;
  // Primera pintura con datos del servidor; LiveBill revalida en vivo.
  const initial = await getTableBill(token);

  return (
    <main className="flex-1 pt-2 pb-16">
      <h1 className="sr-only">Cuenta de la mesa {table.number}</h1>
      <LiveBill token={token} initialBill={initial.ok ? initial.data : undefined} />
    </main>
  );
}
