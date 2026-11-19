import { cookies } from "next/headers";
import { englishEnabled, LOCALE_COOKIE, normalizeLocale } from ".";

export const allowEnglish = () => englishEnabled(process.env.NODE_ENV === "production", process.env.CUSTOMER_ENGLISH_PREVIEW === "true");
export async function getCustomerLocale() {
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return locale === "en" && !allowEnglish() ? "es" : locale;
}
