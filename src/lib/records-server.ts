import 'server-only';
import { recordsConnection } from './records-connection';
import { FULL_COLUMNS, LIST_COLUMNS } from './reports';

// Only the Next.js server receives the StockConnect credential.
export async function getLocalReports(ticker?: string): Promise<unknown[]> {
  const {base, headers} = recordsConnection();
  const records: Record<string, unknown>[] = [];
  let total = 1;
  while (records.length < total) {
    const query = new URLSearchParams({latest: 'true', limit: '100', offset: String(records.length),
      fields: ticker ? FULL_COLUMNS : LIST_COLUMNS});
    if (ticker) query.set('ticker', ticker.toUpperCase());
    const response = await fetch(`${base}/v1/reports?${query}`, {
      headers, cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error('StockConnect reports are temporarily unavailable.');
    const page = await response.json();
    if (!Array.isArray(page.items) || !Number.isInteger(page.total)) throw new Error('Invalid records response.');
    if (!page.items.length && records.length < page.total) throw new Error('Incomplete records response.');
    records.push(...page.items);
    total = page.total;
  }
  return records.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}
