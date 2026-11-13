import 'server-only';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { getCache } from '@vercel/functions';
import { cachedSnapshot } from './snapshot-cache';
import { recordsConnection } from './records-connection';
import { FULL_COLUMNS, LIST_COLUMNS } from './reports';

// Only the Next.js server receives the StockConnect credential.
async function fetchLocalReports(ticker?: string): Promise<unknown[]> {
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

// Cache the complete, validated pagination result; never publish half a refresh.
const REPORTS_REVALIDATE_SECONDS = 60;
const readReportsSnapshot = cachedSnapshot('reports-v1', REPORTS_REVALIDATE_SECONDS, fetchLocalReports);
const readFreshReportDetails = cachedSnapshot('reports-v1', REPORTS_REVALIDATE_SECONDS, fetchLocalReports, true);

function scheduledReportsKey() {
  const {base, headers} = recordsConnection();
  const scope = createHash('sha256').update(base).update(headers.Authorization).digest('hex');
  return `scheduled-report-summaries-v1:${scope}`;
}

export async function refreshReportsSnapshot() {
  const key = scheduledReportsKey();
  const reports = await fetchLocalReports();
  const fetchedAt = new Date().toISOString();
  const payload = gzipSync(JSON.stringify(reports)).toString('base64');
  if (Buffer.byteLength(payload) > 1_990_000) throw new Error('Report snapshot exceeds cache limit.');
  const cache = getCache();
  await cache.set(key, {payload, fetchedAt});
  const saved = await cache.get(key) as {fetchedAt: string} | null;
  if (saved?.fetchedAt !== fetchedAt) throw new Error('Report snapshot could not be verified.');
  return {fetchedAt, count: reports.length};
}

export async function getReportsSnapshot() {
  if (process.env.STOCKVIEW_REPORT_REFRESH_SECRET) {
    const saved = await getCache().get(scheduledReportsKey()) as {payload: string; fetchedAt: string} | null;
    if (!saved) throw new Error('Scheduled report snapshot is unavailable.');
    return {
      data: JSON.parse(gunzipSync(Buffer.from(saved.payload, 'base64')).toString('utf8')) as unknown[],
      fetchedAt: saved.fetchedAt,
      stale: Date.now() - Date.parse(saved.fetchedAt) >= 20 * 60_000,
    };
  }

  const snapshot = await readReportsSnapshot();
  return {
    ...snapshot,
    stale: Date.now() - Date.parse(snapshot.fetchedAt) >= REPORTS_REVALIDATE_SECONDS * 1000,
  };
}
export async function getLocalReports(ticker?: string): Promise<unknown[]> {
  return (await (ticker ? readFreshReportDetails(ticker) : getReportsSnapshot())).data;
}
