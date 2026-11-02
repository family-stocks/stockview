import { NextResponse } from "next/server";
import { normalizeTickers, parseLatestQuotes, QUOTE_BATCH_SIZE, tiingoSymbol } from "@/lib/quotes";

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
    const results = await Promise.allSettled(["iex", "tiingo/equity/intraday"].map(async feed => {
      const response = await fetch(`https://api.tiingo.com/${feed}/${symbols.join(",")}`, {
        headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Tiingo ${feed} returned ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid Tiingo quote response");
      return data;
    }));
    if (results.every(result => result.status === "rejected")) {
      console.error("Both Tiingo quote feeds failed.");
      return NextResponse.json({ error: "Price service unavailable" }, { status: 502 });
    }
    const data = results.map(result => result.status === "fulfilled" ? result.value : []);
    return NextResponse.json({ prices: parseLatestQuotes(tickers, data[0], data[1]) });
  } catch {
    console.error("Tiingo quote request failed or returned an invalid response.");
    return NextResponse.json({ error: "Price service unavailable" }, { status: 502 });
  }
}
