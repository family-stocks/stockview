export const QUOTE_BATCH_SIZE = 100;
export type LatestPrice = {
  price: number | null;
  date: string | null;
  timestamp?: string | null;
  status: "ok" | "unavailable" | "error";
  source?: "IEX last" | "Tiingo reference" | "Tiingo consolidated";
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

// Consolidated snapshots cover premarket and postmarket; select by the actual
// observation timestamp so an older IEX trade cannot mask a newer reference.
export function parseLatestQuotes(tickers: string[], iex: unknown, consolidated: unknown): LatestPriceMap {
  const candidates = new Map<string, LatestPrice[]>();
  for (const [data, isConsolidated] of [[iex, false], [consolidated, true]] as const) {
    if (!Array.isArray(data)) continue;
    for (const row of data) {
      if (!row || typeof row !== "object" || typeof row.ticker !== "string") continue;
      const fields = isConsolidated
        ? [[row.tngoLast, row.timestamp, "Tiingo consolidated"], [row.lqRefPrice, row.timestamp, "Tiingo consolidated"]] as const
        : [[row.last, row.lastSaleTimestamp ?? row.timestamp, "IEX last"], [row.tngoLast, row.timestamp, "Tiingo reference"]] as const;
      for (const [price, timestamp, source] of fields) {
        if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 ||
            typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp)) ||
            Date.parse(timestamp) > Date.now() + 60_000) continue;
        const symbol = tiingoSymbol(row.ticker);
        const values = candidates.get(symbol) ?? [];
        values.push({ price, timestamp, date: timestamp.split("T")[0], source, status: "ok" });
        candidates.set(symbol, values);
      }
    }
  }
  return Object.fromEntries(tickers.map(ticker => [ticker,
    candidates.get(tiingoSymbol(ticker))?.sort((a, b) => Date.parse(b.timestamp!) - Date.parse(a.timestamp!))[0]
      ?? { price: null, date: null, timestamp: null, status: "unavailable" },
  ]));
}
