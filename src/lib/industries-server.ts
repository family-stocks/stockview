import 'server-only';
import { getCache } from '@vercel/functions';
import { decodeHTMLAttribute } from 'entities';
import { after } from 'next/server';
import finvizSeed from './finviz-industry-seed.json';
import { reportRowId, reportRowTicker } from './reports';

type IndustryEntry = { reportId: string; industry: string | null; retryAt?: number };
type IndustrySnapshot = { entries: Record<string, IndustryEntry>; nextBatchAt: number };
type ReportTicker = { ticker: string; reportId: string };

const CACHE_KEY = 'finviz-report-industries-v1';
const BATCH_SIZE = 6;
const BATCH_INTERVAL = 30_000;
const RETRY_INTERVAL = 60 * 60_000;
// One-time export of Finviz classifications for reports already on the dashboard.
const seedIndustries: Partial<Record<string, string>> = finvizSeed;
const cache = getCache();
let refreshing: Promise<void> | undefined;

async function fetchIndustry(ticker: string, deadline: AbortSignal): Promise<string | null> {
  // Finviz uses a dash for class shares such as BRK.B.
  const symbol = ticker.replaceAll('.', '-');
  const url = new URL('https://finviz.com/stock');
  url.searchParams.set('t', symbol);
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.any([deadline, AbortSignal.timeout(3_000)]),
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Finviz returned HTTP ${response.status}`);

  const html = await response.text();
  const title = html.match(/<title>\s*([^<]+)<\/title>/i)?.[1];
  const categories = html.match(/<div class="quote-header_categories">([\s\S]*?)<\/div>/)?.[1];
  if (!title?.startsWith(`${symbol} - `) || !categories) {
    throw new Error('Finviz quote did not match the requested ticker');
  }

  const industryLink = categories.match(/<a\b[^>]*\bhref="[^"]*[?&;]f=(?:industry_|etf_sectype_)[^"]*"[^>]*>/)?.[0];
  const label = decodeHTMLAttribute(industryLink?.match(/\btitle="([^"]+)"/)?.[1] ?? '').trim();
  if (!label) throw new Error('Finviz industry label was missing');
  return label;
}

async function readSnapshot(): Promise<IndustrySnapshot> {
  return (await cache.get(CACHE_KEY) as IndustrySnapshot | null) ?? { entries: {}, nextBatchAt: 0 };
}

async function refreshIndustries(candidates: ReportTicker[]) {
  const snapshot = await readSnapshot();
  const now = Date.now();
  if (now < snapshot.nextBatchAt) return;
  const batch = candidates.filter(({ ticker, reportId }) => {
    const previous = snapshot.entries[ticker];
    return previous?.reportId !== reportId || (previous.retryAt !== undefined && previous.retryAt <= now);
  }).slice(0, BATCH_SIZE);
  if (!batch.length) return;

  await cache.set(CACHE_KEY, { ...snapshot, nextBatchAt: now + BATCH_INTERVAL });
  const deadline = AbortSignal.timeout(8_000);
  const updates: IndustrySnapshot['entries'] = {};
  for (const { ticker, reportId } of batch) {
    if (deadline.aborted) break;
    try {
      updates[ticker] = { reportId, industry: await fetchIndustry(ticker, deadline) };
    } catch (error) {
      console.warn('Stockview could not refresh a Finviz industry:', error instanceof Error ? error.message : String(error));
      updates[ticker] = {
        reportId,
        industry: snapshot.entries[ticker]?.industry ?? null,
        retryAt: Date.now() + RETRY_INTERVAL,
      };
      // Stop this batch on an upstream error and retain labels already cached.
      break;
    }
  }

  const latest = await readSnapshot();
  for (const [ticker, entry] of Object.entries(updates)) {
    if (latest.entries[ticker]?.reportId === snapshot.entries[ticker]?.reportId) {
      latest.entries[ticker] = entry;
    }
  }
  await cache.set(CACHE_KEY, {
    entries: latest.entries,
    nextBatchAt: Date.now() + BATCH_INTERVAL,
  });
}

export async function withReportIndustries(rows: unknown[], stale: boolean): Promise<unknown[]> {
  let snapshot: IndustrySnapshot | undefined;
  try {
    snapshot = await readSnapshot();
    if (!stale && Date.now() >= snapshot.nextBatchAt) {
      const candidates = new Map<string, ReportTicker>();
      for (const row of rows) {
        const ticker = reportRowTicker(row);
        const reportId = reportRowId(row);
        if (ticker && reportId && /^[A-Z0-9][A-Z0-9.-]{0,31}$/.test(ticker) && !candidates.has(ticker)) {
          candidates.set(ticker, { ticker, reportId });
        }
      }
      after(async () => {
        refreshing ??= refreshIndustries([...candidates.values()]).catch(() => {
          console.warn('Stockview industry cache is temporarily unavailable');
        }).finally(() => { refreshing = undefined; });
        await refreshing;
      });
    }

  } catch {
    // Keep the bundled labels available when the runtime cache cannot be read.
  }

  return rows.map(row => {
    const ticker = reportRowTicker(row);
    const industry = ticker && (snapshot?.entries[ticker]?.industry ?? seedIndustries[ticker]);
    return industry ? { ...(row as Record<string, unknown>), industry } : row;
  });
}
