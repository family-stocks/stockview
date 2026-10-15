import 'server-only';
import { recordsConnection } from './records-connection';

export type StoredCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export async function getStoredCandles(symbol: string, start?: string, end?: string): Promise<StoredCandle[]> {
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
  return result.items;
}
