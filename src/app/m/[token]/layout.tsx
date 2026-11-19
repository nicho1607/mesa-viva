import type { Metadata } from "next";
import { connection } from "next/server";
import { HeaderNav } from "@/components/customer/HeaderNav";
import { getCustomerTable } from "@/lib/customer-table";
import { CustomerDocumentTitle, CustomerMessage, LanguageSelector, TableLabel } from "@/components/customer/LanguageProvider";
import { getCustomerLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n";

export async function generateMetadata({ params }: LayoutProps<"/m/[token]">): Promise<Metadata> {
  const { token } = await params;
  const table = await getCustomerTable(token);
  const locale = await getCustomerLocale();
  return { title: `${table ? `${translate(locale, "metaMenu")} · ${translate(locale, "table", { number: table.number })}` : translate(locale, "invalidTitle")} · Mesa Viva`, description: translate(locale, "metaDescription") };
}

export default async function CustomerLayout({ children, params }: LayoutProps<"/m/[token]">) {
  await connection();
  const { token } = await params;
  const table = await getCustomerTable(token);

  if (!table) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-16 pb-12">
        <CustomerDocumentTitle />
        <LanguageSelector />
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight [font-stretch:87.5%]">
          <CustomerMessage message="invalidTitle" />
        </h1>
        <p className="mt-3 text-lg text-tinta-suave">
          <CustomerMessage message="invalidHelp" />
        </p>
      </main>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4">
      <CustomerDocumentTitle number={table.number} />
      <header className="flex flex-wrap items-center justify-between gap-4 pt-5 pb-3">
        <p className="font-display text-[2rem] leading-none font-semibold tracking-tight [font-stretch:87.5%]">
          <TableLabel number={table.number} />
        </p>
        <HeaderNav token={token} />
        <LanguageSelector />
      </header>
      {children}
    </div>
  );
}
