import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import { QueryProvider } from "@/components/providers/QueryProvider";
import "./globals.css";
import { getCustomerLocale } from "@/lib/i18n/server";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["wdth"],
});

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Mesa Viva",
  description: "Menú virtual y pedidos en tiempo real",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getCustomerLocale();
  return (
    <html
      lang={locale}
      className={`${bricolage.variable} ${atkinson.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
