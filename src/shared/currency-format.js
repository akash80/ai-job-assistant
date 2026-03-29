/**
 * Display USD amounts in the user's chosen preference currency.
 * Model pricing is stored in USD; prefs.usdToDisplayCurrencyFactor converts at display time.
 */

export function formatUsdInPreferenceCurrency(usdAmount, prefs) {
  const n = Number(usdAmount);
  const amount = Number.isFinite(n) ? n : 0;
  const code = (prefs?.salaryCurrency || "USD").toUpperCase();
  let factor = Number(prefs?.usdToDisplayCurrencyFactor);
  if (!Number.isFinite(factor) || factor <= 0) {
    factor = code === "USD" ? 1 : 1;
  }
  const converted = amount * factor;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(converted);
  } catch {
    return `${converted.toFixed(4)} ${code}`;
  }
}
