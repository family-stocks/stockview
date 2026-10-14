export const QUOTE_BATCH_SIZE = 100;
export type LatestPrice = {
  price: number | null;
  date: string | null;
  status: "ok" | "unavailable" | "error";
  source?: "IEX last" | "Tiingo reference";
};
export type LatestPriceMap = Record<string, LatestPrice>;
export function normalizeTickers(value: string | null) {
  return Array.from(new Set((value || "").split(",")
    .map(ticker => ticker.trim().toUpperCase())
    .filter(ticker => /^[A-Z.\-]{1,10}$/.test(ticker))));
}
export function quoteBatches(tickers: string[]) {
  const batches: string[][] = [];
  for (let i = 0; i < tickers.length; i += QUOTE_BATCH_SIZE) {
    batches.push(tickers.slice(i, i + QUOTE_BATCH_SIZE));
  }
  return batches;
}
export function tiingoSymbol(ticker: string) {
  return ticker.toUpperCase().replaceAll(".", "-");
}
export function parseIexQuotes(tickers: string[], data: unknown): LatestPriceMap {
  if (!Array.isArray(data)) throw new Error("Invalid Tiingo quote response");
  const quotes = new Map<string, Record<string, unknown>>();
  for (const row of data) {
    if (row && typeof row === "object" && typeof row.ticker === "string") {
      quotes.set(tiingoSymbol(row.ticker), row);
    }
  }
  return Object.fromEntries(tickers.map(ticker => {
    const quote = quotes.get(tiingoSymbol(ticker));
    const last = quote?.last;
    const reference = quote?.tngoLast;
    const hasLast = typeof last === "number" && Number.isFinite(last) && last > 0;
    const hasReference = typeof reference === "number" && Number.isFinite(reference) && reference > 0;
    const price = hasLast ? last : hasReference ? reference : null;
    const timestamp = hasLast ? quote?.lastSaleTimestamp ?? quote?.timestamp : quote?.timestamp;
    const date = typeof timestamp === "string" && Number.isFinite(Date.parse(timestamp))
      ? timestamp.split("T")[0] : null;
    return [ticker, {
      price, date, status: price === null ? "unavailable" : "ok",
      ...(price === null ? {} : { source: hasLast ? "IEX last" : "Tiingo reference" }),
    } satisfies LatestPrice];
  }));
}
