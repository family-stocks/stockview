import { NextResponse } from "next/server";
import { getTiingoStockData } from "@/lib/tiingo";

export const revalidate = 3600;

type LatestPrice = {
  price: number | null;
  date: string | null;
};

function normalizeTickers(value: string | null) {
  if (!value) return [];
  return Array.from(new Set(
    value
      .split(",")
      .map(ticker => ticker.trim().toUpperCase())
      .filter(ticker => /^[A-Z.\-]{1,10}$/.test(ticker))
  )).slice(0, 100);
}

async function getLatestPrice(ticker: string): Promise<LatestPrice> {
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
  const prices = await getTiingoStockData(ticker, startDate, endDate);
  const latest = prices
    .filter(price => Number.isFinite(price.close))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);

  return {
    price: latest?.close ?? null,
    date: latest?.date?.split("T")[0] ?? null,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickers = normalizeTickers(searchParams.get("tickers"));

  if (!tickers.length) {
    return NextResponse.json({ error: "At least one ticker is required" }, { status: 400 });
  }

  const entries = await Promise.all(
    tickers.map(async ticker => [ticker, await getLatestPrice(ticker)] as const)
  );

  return NextResponse.json({ prices: Object.fromEntries(entries) });
}
