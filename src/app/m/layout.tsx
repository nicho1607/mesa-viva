import { LanguageProvider } from "@/components/customer/LanguageProvider";
import { allowEnglish, getCustomerLocale } from "@/lib/i18n/server";

export default async function CustomerLanguageLayout({ children }: LayoutProps<"/m">) {
  return <LanguageProvider initialLocale={await getCustomerLocale()} enabled={allowEnglish()}>{children}</LanguageProvider>;
}
