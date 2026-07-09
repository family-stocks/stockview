import { isValidElement, type HTMLAttributes, type ReactNode } from "react";
import Chart from "@/components/Chart";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { getTiingoStockData } from "@/lib/tiingo";
import { computeAllIndicators, type OHLCV } from "@/lib/indicators";
import {
  supabase,
  normalizeRow,
  FULL_COLUMNS,
  BASE_FULL_COLUMNS,
  TRADE_PLAN_LOOKUP_COLUMNS,
  TRADE_PLAN_TICKER_LOOKUP_COLUMNS,
  isTradePlanColumnError,
  mergeRowsById,
  mergeRowsByTicker,
  reportRowId,
  reportRowTicker,
} from "@/lib/supabase";

export const revalidate = 3600;

type ReportSection = {
  id: string;
  title: string;
  level: number;
};

async function getStockData(ticker: string) {
  const today = new Date().toISOString().split("T")[0];

  const raw = await getTiingoStockData(ticker, undefined, today);
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

  const candles = allData;
  const indicators = computeAllIndicators(allData, allData[0].time);

  return { candles, indicators };
}

async function getReport(ticker: string) {
  async function fetchReport(columns: string) {
    return supabase
      .from("latest_agent_reports")
      .select(columns)
      .ilike("ticker", ticker)
      .limit(1)
      .maybeSingle();
  }

  async function enrichTradePlan(row: unknown) {
    let enriched = row;
    const id = reportRowId(row);

    if (id) {
      const tradePlan = await supabase
        .from("research_reports")
        .select(TRADE_PLAN_LOOKUP_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      if (!tradePlan.error && tradePlan.data) {
        enriched = mergeRowsById([enriched], [tradePlan.data])[0];
      }
    }

    const report = normalizeRow(enriched);
    if (report.target_price !== null && report.stop_loss_price !== null) return enriched;

    const lookupTicker = reportRowTicker(enriched) || ticker.toUpperCase();
    const tradePlanByTicker = await supabase
      .from("research_reports")
      .select(TRADE_PLAN_TICKER_LOOKUP_COLUMNS)
      .in("ticker", [lookupTicker, lookupTicker.toLowerCase()])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tradePlanByTicker.error || !tradePlanByTicker.data) return enriched;
    return mergeRowsByTicker([enriched], [tradePlanByTicker.data])[0];
  }

  const initial = await fetchReport(FULL_COLUMNS);
  let data: unknown = initial.data ? await enrichTradePlan(initial.data) : initial.data;
  let error: { message: string } | null = initial.error;

  if (error && isTradePlanColumnError(error)) {
    const fallback = await fetchReport(BASE_FULL_COLUMNS);
    data = fallback.data;
    error = fallback.error;

    if (!error) data = await enrichTradePlan(data);
  }

  if (error) return null;
  return data ? normalizeRow(data) : null;
}

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return "Unset";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null) return "";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function stripMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugBase(value: string) {
  return stripMarkdown(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function uniqueSlug(value: string, counts: Map<string, number>) {
  const base = slugBase(value);
  const next = counts.get(base) || 0;
  counts.set(base, next + 1);
  return next === 0 ? base : `${base}-${next + 1}`;
}

function extractReportSections(markdown: string): ReportSection[] {
  const counts = new Map<string, number>();
  return markdown
    .split("\n")
    .map(line => /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map(match => {
      const title = stripMarkdown(match[2]);
      return {
        id: uniqueSlug(title, counts),
        title,
        level: match[1].length,
      };
    });
}

function nodeToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeToText(node.props.children);
  return "";
}

function headingWithAnchor(
  Tag: "h2" | "h3" | "h4",
  children: ReactNode,
  props: HTMLAttributes<HTMLHeadingElement>,
  counts: Map<string, number>,
) {
  const text = nodeToText(children);
  const id = uniqueSlug(text, counts);
  const HeadingTag = Tag;

  return (
    <HeadingTag {...props} id={id} className="report-heading-anchor">
      {children}
      <a href={`#${id}`} aria-label={`Link to ${text}`}>#</a>
    </HeadingTag>
  );
}

function buildMarkdownComponents(): Components {
  const counts = new Map<string, number>();
  return {
    h1({ children, node, ...props }) {
      void node;
      return headingWithAnchor("h2", children, props, counts);
    },
    h2({ children, node, ...props }) {
      void node;
      return headingWithAnchor("h3", children, props, counts);
    },
    h3({ children, node, ...props }) {
      void node;
      return headingWithAnchor("h4", children, props, counts);
    },
  };
}

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
  const targetMove  = latestPrice && report?.target_price ? ((report.target_price - latestPrice) / latestPrice) * 100 : null;
  const stopMove    = latestPrice && report?.stop_loss_price ? ((report.stop_loss_price - latestPrice) / latestPrice) * 100 : null;
  const reportMarkdown = report?.full_report_markdown || "";
  const reportSections = reportMarkdown ? extractReportSections(reportMarkdown) : [];
  const markdownComponents = reportMarkdown ? buildMarkdownComponents() : undefined;

  return (
    <div className="stock-detail-shell">
      <section className="chart-section">
        <div className="stock-workspace">
          <div className="stock-topline">
            <Link href="/" className="back-link">
              <ArrowLeft size={15} aria-hidden="true" /> Dashboard
            </Link>
            <div className="stock-identity">
              <h1>{symbol}</h1>
              {report && <p>{report.company}</p>}
              {report && (
                <span className="rating-badge" data-rating={report.rating}>
                  {report.rating}
                </span>
              )}
            </div>
          </div>

          <div className="stock-price-strip" aria-label="Trade plan summary">
            <div className="quote-tile">
              <span>Latest</span>
              <strong>{formatCurrency(latestPrice)}</strong>
              {pctChange !== null && (
                <small className={pctChange >= 0 ? "tone-up" : "tone-down"}>
                  {formatPercent(pctChange)}
                </small>
              )}
            </div>
            <div className="quote-tile">
              <span>Target</span>
              <strong>{formatCurrency(report?.target_price)}</strong>
              {targetMove !== null && (
                <small className={targetMove >= 0 ? "tone-up" : "tone-down"}>
                  {formatPercent(targetMove)} vs latest
                </small>
              )}
            </div>
            <div className="quote-tile">
              <span>Stop loss</span>
              <strong>{formatCurrency(report?.stop_loss_price)}</strong>
              {stopMove !== null && (
                <small className={stopMove >= 0 ? "tone-up" : "tone-down"}>
                  {formatPercent(stopMove)} vs latest
                </small>
              )}
            </div>
            {report && (
              <div className="quote-tile quote-tile-wide">
                <span>Report source</span>
                <strong>{report.filing_form || "Filing"}</strong>
                <small>{report.filing_date || "No filing date"} / {report.model}</small>
              </div>
            )}
          </div>

          <Chart data={candles} indicators={indicators ?? undefined} />
        </div>
      </section>

      {reportMarkdown && (
        <section className="report-workspace" aria-label="Full research report">
          <aside className="report-outline-card">
            <span className="eyebrow">Report map</span>
            <h2>Jump to section</h2>
            {reportSections.length > 0 ? (
              <nav aria-label="Report sections">
                {reportSections.map(section => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={`outline-link outline-level-${section.level}`}
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            ) : (
              <p>No markdown headings detected in this report.</p>
            )}
          </aside>

          <article className="card report-card" id="report-top">
            <div className="report-card-header">
              <span className="eyebrow">Full thesis</span>
              <h2>{symbol} research report</h2>
              <p>Use the section map to move through valuation, risks, catalysts, and model commentary without scanning the whole document.</p>
            </div>
            <div className="report-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {reportMarkdown}
              </ReactMarkdown>
            </div>
          </article>
        </section>
      )}
    </div>
  );
}
