import 'server-only';
import { cachedSnapshot } from './snapshot-cache';
import { recordsConnection } from './records-connection';

export type StoredCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

async function fetchStoredCandles(symbol: string, start?: string, end?: string): Promise<StoredCandle[]> {
  const {base, headers} = recordsConnection();
  const query = new URLSearchParams();
  if (start) query.set('start', start);
  if (end) query.set('end', end);
  const response = await fetch(`${base}/v1/candles/${encodeURIComponent(symbol)}?${query}`, {
    headers,
    cache: 'no-store', signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error('Stored chart data is temporarily unavailable.');
  const result = await response.json();
  if (!Array.isArray(result.items)) throw new Error('Invalid candle response.');
  return result.items;
}

const getCandlesSnapshot = cachedSnapshot('daily-candles-v1', 900, fetchStoredCandles);
export async function getStoredCandles(symbol: string, start?: string, end?: string): Promise<StoredCandle[]> {
  return (await getCandlesSnapshot(symbol.toUpperCase(), start, end)).data;
}
