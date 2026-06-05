import { NextResponse } from 'next/server';
import { getTiingoStockData, formatTiingoForChart } from '@/lib/tiingo';
import { computeAllIndicators, type OHLCV } from '@/lib/indicators';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  if (!ticker) return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });

  // Fetch an extra 400 days for SMA200 warmup
  const warmupStart = startDate
    ? new Date(new Date(startDate).getTime() - 400 * 86400000).toISOString().split('T')[0]
    : undefined;

  const raw = await getTiingoStockData(ticker, warmupStart, endDate);
  if (!raw.length) return NextResponse.json({ error: 'No data found' }, { status: 404 });

  const data: OHLCV[] = raw
    .map(d => ({
      time: d.date.split('T')[0],
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const windowStart = startDate || data[0].time;
  const candles = data.filter(d => d.time >= windowStart);
  const indicators = computeAllIndicators(data, windowStart);

  return NextResponse.json({ candles, ...indicators });
}
