import { connection } from "next/server";
import { getMenu } from "@/app/actions/order.actions";
import { CustomerMenu } from "@/components/customer/CustomerMenu";
import { getCustomerTable } from "@/lib/customer-table";
import { CustomerHeading, CustomerMessage } from "@/components/customer/LanguageProvider";

export default async function CustomerMenuPage({ params }: PageProps<"/m/[token]">) {
  await connection();
  const { token } = await params;
  // El layout ya muestra el mensaje de código no válido; aquí solo evitamos cargar el menú.
  const table = await getCustomerTable(token);
  if (!table) return null;
  const categories = await getMenu();

  return (
    <main className="flex-1 pb-28">
      <CustomerHeading number={table.number} />
      {categories.length === 0 ? (
        <p className="py-10 text-lg text-tinta-suave"><CustomerMessage message="emptyMenu" /></p>
      ) : (
        <CustomerMenu token={token} categories={categories} />
      )}
    </main>
  );
}
