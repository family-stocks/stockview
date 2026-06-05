import Chart from "@/components/Chart";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getTiingoStockData } from "@/lib/tiingo";
import { computeAllIndicators, type OHLCV } from "@/lib/indicators";
import { supabase, normalizeRow } from "@/lib/supabase";

export const revalidate = 3600;

async function getStockData(ticker: string) {
  const today = new Date().toISOString().split("T")[0];
  // Fetch 2.5 years so SMA200 has enough warmup data
  const warmupStart = new Date(Date.now() - 912 * 86400000).toISOString().split("T")[0];
  const displayStart = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

  const raw = await getTiingoStockData(ticker, warmupStart, today);
  if (!raw.length) return { candles: [], indicators: null };

  const allData: OHLCV[] = raw
    .map(d => ({
      time: d.date.split("T")[0],
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const candles = allData.filter(d => d.time >= displayStart);
  const indicators = computeAllIndicators(allData, displayStart);

  return { candles, indicators };
}

const FULL_COLUMNS =
  'id,ticker,sec_company_name,analysis_date,sec_filing_form,sec_filing_date,' +
  'final_decision,llm_provider,deep_think_llm,analysts,created_at,' +
  'final_trade_decision,full_report_markdown';

async function getReport(ticker: string) {
  const { data } = await supabase
    .from("latest_agent_reports")
    .select(FULL_COLUMNS)
    .ilike("ticker", ticker)
    .limit(1)
    .single();
  return data ? normalizeRow(data) : null;
}

const ratingColors: Record<string, string> = {
  BUY: 'var(--status-up)',
  SELL: 'var(--status-down)',
  HOLD: 'var(--status-warning)',
};

const ratingBg: Record<string, string> = {
  BUY: 'rgba(16,185,129,0.1)',
  SELL: 'rgba(239,68,68,0.1)',
  HOLD: 'rgba(245,158,11,0.1)',
};

export default async function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  const [{ candles, indicators }, report] = await Promise.all([
    getStockData(symbol),
    getReport(symbol),
  ]);

  const latestPrice = candles.length ? candles[candles.length - 1].close : null;
  const prevPrice   = candles.length > 1 ? candles[candles.length - 2].close : null;
  const priceChange = latestPrice && prevPrice ? latestPrice - prevPrice : null;
  const pctChange   = priceChange && prevPrice ? (priceChange / prevPrice) * 100 : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* Full-width chart section */}
      <div style={{ width: '100%', backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', padding: '1.25rem 1.5rem' }}>
        {/* Header row */}
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
              <ArrowLeft size={15} /> Dashboard
            </Link>
            <span style={{ color: 'var(--border-subtle)' }}>·</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>{symbol}</span>
              {report && <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{report.company}</span>}
              {latestPrice && (
                <span style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 600 }}>
                  ${latestPrice.toFixed(2)}
                </span>
              )}
              {pctChange !== null && (
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: pctChange >= 0 ? 'var(--status-up)' : 'var(--status-down)' }}>
                  {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(2)}%
                </span>
              )}
              {report && (
                <span style={{
                  padding: '0.2rem 0.6rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: ratingBg[report.rating] || ratingBg.HOLD,
                  color: ratingColors[report.rating] || ratingColors.HOLD,
                }}>
                  {report.rating}
                </span>
              )}
            </div>
          </div>

          <Chart data={candles} indicators={indicators ?? undefined} />
        </div>
      </div>

      {/* Report below chart */}
      {report?.full_report_markdown && (
        <div style={{ maxWidth: '1600px', margin: '0 auto', width: '100%', padding: '2rem 1.5rem' }}>
          <div className="card" style={{ padding: '1.5rem 2rem' }}>
            <div className="report-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report.full_report_markdown}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
