// src/lib/tiingo.ts

export interface TiingoPrice {
  date: string;
  close: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  adjClose: number;
  adjHigh: number;
  adjLow: number;
  adjOpen: number;
  adjVolume: number;
  divCash: number;
  splitFactor: number;
}

export async function getTiingoStockData(symbol: string, startDate?: string, endDate?: string): Promise<TiingoPrice[]> {
  const apiKey = process.env.TIINGO_API_KEY;
  if (!apiKey) {
    console.error("TIINGO_API_KEY is not set.");
    return [];
  }

  const url = new URL(`https://api.tiingo.com/tiingo/daily/${symbol}/prices`);
  if (startDate) url.searchParams.append("startDate", startDate);
  if (endDate) url.searchParams.append("endDate", endDate);
  url.searchParams.append("format", "json");
  url.searchParams.append("resampleFreq", "daily");

  const res = await fetch(url.toString(), {
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    // Tiingo data updates daily, so caching for a few hours is fine
    next: { revalidate: 3600 }
  });

  if (!res.ok) {
    console.error(`Tiingo fetch failed for ${symbol}: ${res.status} ${res.statusText}`);
    return [];
  }

  const data = await res.json();
  return data;
}

export function formatTiingoForChart(data: TiingoPrice[]) {
  return data.map(d => ({
    time: d.date.split('T')[0],
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  }));
}
