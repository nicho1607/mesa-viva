// Formato de dinero para la UI. Los montos viajan siempre en centavos enteros.

const ZERO_DECIMAL_CURRENCIES = new Set(["COP"]);

const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, locale: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let f = formatters.get(key);
  if (!f) {
    const digits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(key, f);
  }
  return f;
}

/** formatMoney(1250000) → "$ 12.500" (COP, es-CO). COP sin decimales; otras monedas con 2. */
export function formatMoney(cents: number, currency = "COP", locale = "es-CO"): string {
  return getFormatter(currency, locale).format(cents / 100);
}
