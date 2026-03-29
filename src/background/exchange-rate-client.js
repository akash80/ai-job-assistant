/**
 * Frankfurter (https://www.frankfurter.app) — free, no API key.
 * ECB-based reference rates; typically updated once per working day.
 * Response: units of `to` currency per 1 unit of `from` (here USD → target).
 */

const FRANKFURTER_LATEST = "https://api.frankfurter.app/latest";

export const CURRENCY_RATE_STALE_MS = 24 * 60 * 60 * 1000;

export class ExchangeRateError extends Error {
  constructor(message, code = "EXCHANGE_RATE_ERROR") {
    super(message);
    this.name = "ExchangeRateError";
    this.code = code;
  }
}

/**
 * @returns {{ factor: number, rawContent: string }} factor multiplies USD amounts for display in `currencyCode`
 */
export async function fetchUsdToCurrencyFactor(currencyCode) {
  const code = String(currencyCode || "USD").trim().toUpperCase();
  if (code === "USD") {
    const raw = JSON.stringify({
      source: "frankfurter",
      base: "USD",
      date: null,
      rates: { USD: 1 },
    });
    return { factor: 1, rawContent: raw };
  }

  const url = `${FRANKFURTER_LATEST}?from=USD&to=${encodeURIComponent(code)}`;
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new ExchangeRateError("Cannot reach exchange rate service. Check your network.", "NETWORK_ERROR");
  }

  if (!response.ok) {
    throw new ExchangeRateError(
      `Exchange rate API returned ${response.status}`,
      response.status === 404 ? "CURRENCY_NOT_FOUND" : "API_ERROR",
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new ExchangeRateError("Invalid response from exchange rate service", "PARSE_ERROR");
  }

  const rate = data.rates?.[code];
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new ExchangeRateError(`No rate available for ${code}`, "INVALID_RATE");
  }

  return { factor: rate, rawContent: JSON.stringify(data) };
}
