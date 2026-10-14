import { NextResponse } from "next/server";
import { normalizeTickers, parseIexQuotes, QUOTE_BATCH_SIZE, tiingoSymbol } from "@/lib/quotes";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickers = normalizeTickers(searchParams.get("tickers"));
  if (!tickers.length || tickers.length > QUOTE_BATCH_SIZE) {
    return NextResponse.json({ error: `Provide between 1 and ${QUOTE_BATCH_SIZE} tickers` }, { status: 400 });
  }
  const apiKey = process.env.TIINGO_API_KEY;
  if (!apiKey) {
    console.error("TIINGO_API_KEY is not set.");
    return NextResponse.json({ error: "Price service is not configured" }, { status: 503 });
  }
  try {
    const symbols = Array.from(new Set(tickers.map(tiingoSymbol))).sort();
    const response = await fetch(`https://api.tiingo.com/iex/${symbols.join(",")}`, {
      headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error(`Tiingo IEX fetch failed: ${response.status}`);
      return NextResponse.json({ error: "Price service unavailable" }, { status: 502 });
    }
    return NextResponse.json({ prices: parseIexQuotes(tickers, await response.json()) });
  } catch {
    console.error("Tiingo IEX request failed or returned an invalid response.");
    return NextResponse.json({ error: "Price service unavailable" }, { status: 502 });
  }
}
