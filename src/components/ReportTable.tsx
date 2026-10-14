"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ReviewCheckpoints, { formatAllocation, formatHorizon, formatReviewDate } from "@/components/ReviewCheckpoints";
import { horizonEndDate } from "@/lib/horizon";
import { normalizeTickers, quoteBatches, type LatestPriceMap } from "@/lib/quotes";
import { Search, X, ExternalLink, Loader2 } from "lucide-react";
import {
  supabase,
  normalizeRow,
  LIST_COLUMNS,
  BASE_LIST_COLUMNS,
  TRADE_PLAN_LOOKUP_COLUMNS,
  TRADE_PLAN_TICKER_LOOKUP_COLUMNS,
  isTradePlanColumnError,
  mergeRowsById,
  mergeRowsByTicker,
  reportRowId,
  reportRowTicker,
  type ResearchReport,
} from "@/lib/supabase";

const RATING_OPTIONS = ["BUY", "HOLD", "SELL"] as const;

function formatDate(value?: string) {
  return value?.split("T")[0] || "";
}

function formatCurrency(value?: number | null, exact = false) {
  if (value === null || value === undefined) return "Unset";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: !exact && value >= 100 ? 0 : 2,
  }).format(value);
}

function hasTradePlan(report: ResearchReport) {
  return report.target_price !== null || report.stop_loss_price !== null;
}

function hasIncompleteTradePlan(row: unknown) {
  const report = normalizeRow(row);
  return report.target_price === null || report.stop_loss_price === null;
}

function tickerLookupVariants(tickers: string[]) {
  return Array.from(new Set(tickers.flatMap(ticker => [ticker, ticker.toLowerCase()])));
}

async function enrichTradePlans(rows: unknown[] | null) {
  if (!rows?.length) return rows;

  let enriched = rows;
  const ids = rows
    .map(reportRowId)
    .filter((id): id is string => Boolean(id));

  if (ids.length) {
    const { data, error } = await supabase
      .from("agent_reports")
      .select(TRADE_PLAN_LOOKUP_COLUMNS)
      .in("id", ids);

    if (!error && data?.length) enriched = mergeRowsById(enriched, data);
  }

  const missingTickers = Array.from(new Set(
    enriched
      .filter(hasIncompleteTradePlan)
      .map(reportRowTicker)
      .filter((ticker): ticker is string => Boolean(ticker)),
  ));
  if (!missingTickers.length) return enriched;

  const tickerLookup = await supabase
    .from("agent_reports")
    .select(TRADE_PLAN_TICKER_LOOKUP_COLUMNS)
    .in("ticker", tickerLookupVariants(missingTickers))
    .order("created_at", { ascending: false });

  if (tickerLookup.error || !tickerLookup.data?.length) return enriched;
  return mergeRowsByTicker(enriched, tickerLookup.data);
}

async function fetchReports() {
  const initial = await supabase
    .from("latest_agent_reports")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false });

  let data: unknown[] | null = await enrichTradePlans(initial.data);
  let error: { message: string } | null = initial.error;

  if (error && isTradePlanColumnError(error)) {
    const fallback = await supabase
      .from("latest_agent_reports")
      .select(BASE_LIST_COLUMNS)
      .order("created_at", { ascending: false });
    data = await enrichTradePlans(fallback.data);
    error = fallback.error;
  }

  return { data, error };
}

export default function ReportTable() {
  const [reports, setReports]     = useState<ResearchReport[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [ratingFilter, setRating] = useState<string[]>([]);
  const [modelFilter, setModel]   = useState<string>("");
  const [selected, setSelected]   = useState<ResearchReport | null>(null);
  const [latestPrices, setLatestPrices] = useState<LatestPriceMap>({});

  const applyReportResult = useCallback((result: Awaited<ReturnType<typeof fetchReports>>) => {
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setReports((result.data || []).map(normalizeRow));
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    applyReportResult(await fetchReports());
  }, [applyReportResult]);

  useEffect(() => {
    let active = true;

    async function loadInitialReports() {
      const result = await fetchReports();
      if (active) applyReportResult(result);
    }

    void loadInitialReports();
    return () => { active = false; };
  }, [applyReportResult]);

  useEffect(() => {
    const tickers = normalizeTickers(reports.map(r => r.ticker).join(","));
    if (!tickers.length) return;
    let active = true;
    const controller = new AbortController();
    async function loadLatestPrices() {
      // Publish each batch as it arrives and keep upstream requests bounded.
      for (const batch of quoteBatches(tickers)) {
        if (!active) return;
        let prices: LatestPriceMap;
        try {
          const response = await fetch(`/api/prices?tickers=${encodeURIComponent(batch.join(","))}`, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          });
          if (!response.ok) throw new Error("Price request failed");
          const payload = await response.json() as { prices?: LatestPriceMap };
          if (!payload.prices) throw new Error("Missing prices");
          prices = Object.fromEntries(batch.map(ticker => [ticker,
            payload.prices![ticker] || { price: null, date: null, status: "unavailable" },
          ]));
        } catch {
          prices = Object.fromEntries(batch.map(ticker => [ticker, {
            price: null, date: null, status: "error",
          }]));
        }
        if (active) setLatestPrices(previous => ({ ...previous, ...prices }));
      }
    }
    void loadLatestPrices();
    return () => { active = false; controller.abort(); };
  }, [reports]);

  const closePanel = useCallback(() => setSelected(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanel]);

  useEffect(() => {
    document.body.style.overflow = selected ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selected]);

  const models = Array.from(new Set(reports.map(r => r.model).filter(Boolean))).sort();

  const filtered = reports.filter(r => {
    const query = search.toLowerCase();
    if (query && !r.ticker.toLowerCase().includes(query) && !r.company.toLowerCase().includes(query)) return false;
    if (ratingFilter.length && !ratingFilter.includes(r.rating)) return false;
    if (modelFilter && r.model !== modelFilter) return false;
    return true;
  });

  const toggleRating = (rating: string) =>
    setRating(prev => prev.includes(rating) ? prev.filter(x => x !== rating) : [...prev, rating]);

  const buys  = reports.filter(r => r.rating === "BUY").length;
  const sells = reports.filter(r => r.rating === "SELL").length;
  const holds = reports.filter(r => r.rating === "HOLD").length;
  const actionable = reports.filter(hasTradePlan).length;
  const activeFilters = ratingFilter.length + (modelFilter ? 1 : 0);

  return (
    <>
      {reports.length > 0 && (
        <section className="dashboard-metrics" aria-label="Research summary">
          <article className="metric-card metric-card-primary">
            <span className="metric-label">Coverage</span>
            <strong>{reports.length}</strong>
            <span className="metric-caption">latest reports</span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Buy / Hold / Sell</span>
            <strong className="metric-split">
              <span className="tone-up">{buys}</span>
              <span>{holds}</span>
              <span className="tone-down">{sells}</span>
            </strong>
            <span className="metric-caption">directional calls</span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Trade Plans</span>
            <strong>{actionable}</strong>
            <span className="metric-caption">with target or stop</span>
          </article>
        </section>
      )}

      <section className="report-terminal-card" aria-label="Latest research reports">
        <div className="report-toolbar">
          <label className="search-field">
            <Search size={15} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search ticker or company"
              className="input"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>

          <div className="filter-cluster" aria-label="Rating filters">
            {RATING_OPTIONS.map(rating => {
              const active = ratingFilter.includes(rating);
              return (
                <button
                  key={rating}
                  type="button"
                  onClick={() => toggleRating(rating)}
                  className={`filter-pill ${active ? "is-active" : ""}`}
                  data-rating={rating}
                  aria-pressed={active}
                >
                  {rating}
                </button>
              );
            })}
          </div>

          {models.length > 1 && (
            <select
              value={modelFilter}
              onChange={e => setModel(e.target.value)}
              className="input model-select"
              aria-label="Filter by model"
            >
              <option value="">All models</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}

          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => { setRating([]); setModel(""); }}
              className="text-link"
            >
              Clear filters
            </button>
          )}

          <span className="result-count" aria-live="polite">
            {loading ? "Loading..." : `${filtered.length} of ${reports.length}`}
          </span>
        </div>

        {loading && (
          <div className="table-state">
            <Loader2 size={24} className="spin" aria-hidden="true" />
            <span>Loading reports...</span>
          </div>
        )}

        {error && (
          <div className="table-state table-state-error">
            <span>Failed to load: {error}</span>
            <button type="button" onClick={loadReports} className="text-link">Retry</button>
          </div>
        )}

        {!loading && !error && (
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  {["Ticker", "Latest", "Call", "Trade Plan", "Horizon / Review", "Source", "Generated"].map(col => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(r);
                      }
                    }}
                    className={selected?.id === r.id ? "is-selected" : undefined}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${r.ticker} report preview`}
                  >
                    <td>
                      <div className="ticker-stack">
                        <span className="ticker-symbol">{r.ticker}</span>
                        <span className="company-name">{r.company}</span>
                      </div>
                    </td>
                    <td>
                      <div className="latest-price-cell">
                        <strong>{latestPrices[r.ticker]?.price != null
                          ? formatCurrency(latestPrices[r.ticker].price, true) : "—"}</strong>
                        <small>{latestPrices[r.ticker]?.status === "ok"
                          ? `${latestPrices[r.ticker].source}${latestPrices[r.ticker].date ? ` · ${latestPrices[r.ticker].date}` : ""}`
                          : latestPrices[r.ticker]?.status === "error" ? "Price request failed"
                          : latestPrices[r.ticker]?.status === "unavailable" ? "No quote available"
                          : "Loading price…"}</small>
                      </div>
                    </td>
                    <td>
                      <span className="rating-badge" data-rating={r.rating}>
                        {r.rating}
                      </span>
                    </td>
                    <td>
                      <div className="trade-plan-grid">
                        <div className="price-chip">
                          <span>Entry</span>
                          <strong>{formatCurrency(r.entry_price, true)}</strong>
                        </div>
                        <div className="price-chip price-chip-target">
                          <span>Target</span>
                          <strong>{formatCurrency(r.target_price)}</strong>
                        </div>
                        <div className="price-chip price-chip-stop">
                          <span>Stop loss</span>
                          <strong>{formatCurrency(r.stop_loss_price)}</strong>
                        </div>
                      </div>
                      <span className="allocation-caption">Proposed allocation: <strong>{formatAllocation(r.position_pct)}</strong></span>
                    </td>
                    <td>
                      <div className="checkpoint-table-summary">
                        <strong>{formatHorizon(r)}</strong>
                        <small>Horizon end: {formatReviewDate(horizonEndDate(r))}</small>
                      </div>
                    </td>
                    <td>
                      <div className="source-stack">
                        <span>{r.filing_form || "Filing"}</span>
                        <small>{r.filing_date || "No filing date"}</small>
                      </div>
                    </td>
                    <td>
                      <div className="model-stack">
                        <span className="model-code">{r.model}</span>
                        <small>{formatDate(r.analysis_date)}</small>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      No reports match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && <div onClick={closePanel} className="drawer-backdrop" />}

      <aside
        className={`report-drawer ${selected ? "is-open" : ""}`}
        role="dialog"
        aria-modal={selected ? true : undefined}
        aria-label="Report preview"
        aria-hidden={!selected}
      >
        {selected && (
          <>
            <div className="drawer-header">
              <div className="drawer-title-block">
                <div className="drawer-title-row">
                  <span>{selected.ticker}</span>
                  <span className="rating-badge" data-rating={selected.rating}>
                    {selected.rating}
                  </span>
                </div>
                <p>{selected.company}</p>
              </div>
              <button type="button" onClick={closePanel} className="icon-button" aria-label="Close preview">
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body">
              <div className="drawer-grid">
                {[
                  { label: "Latest", value: formatCurrency(latestPrices[selected.ticker]?.price) },
                  { label: "Entry price", value: formatCurrency(selected.entry_price, true) },
                  { label: "Target", value: formatCurrency(selected.target_price) },
                  { label: "Stop loss", value: formatCurrency(selected.stop_loss_price) },
                  { label: "Model", value: selected.model },
                  { label: "Filing", value: `${selected.filing_form || "Filing"}${selected.filing_date ? " / " + selected.filing_date : ""}` },
                  { label: "Date", value: formatDate(selected.analysis_date) },
                  { label: "Analysts", value: selected.analysts?.join(", ") || "None listed" },
                ].map(({ label, value }) => (
                  <div key={label} className="drawer-fact">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              <ReviewCheckpoints report={selected} />

              <Link
                href={`/stock/${selected.ticker}`}
                onClick={closePanel}
                className="btn btn-primary drawer-action"
              >
                <ExternalLink size={15} /> View Full Report and Chart
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
