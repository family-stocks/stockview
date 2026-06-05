"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, X, ExternalLink, Loader2 } from "lucide-react";
import { supabase, normalizeRow, LIST_COLUMNS, type ResearchReport } from "@/lib/supabase";

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

export default function ReportTable() {
  const [reports, setReports]     = useState<ResearchReport[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [ratingFilter, setRating] = useState<string[]>([]);
  const [modelFilter, setModel]   = useState<string>("");
  const [selected, setSelected]   = useState<ResearchReport | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('latest_agent_reports')
      .select(LIST_COLUMNS)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setReports((data || []).map(normalizeRow));
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

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

  // Unique model values for the model filter dropdown
  const models = Array.from(new Set(reports.map(r => r.model).filter(Boolean))).sort();

  const filtered = reports.filter(r => {
    if (search && !r.ticker.toLowerCase().includes(search.toLowerCase()) && !r.company.toLowerCase().includes(search.toLowerCase())) return false;
    if (ratingFilter.length && !ratingFilter.includes(r.rating)) return false;
    if (modelFilter && r.model !== modelFilter) return false;
    return true;
  });

  const toggleRating = (r: string) =>
    setRating(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);

  const buys  = reports.filter(r => r.rating === 'BUY').length;
  const sells = reports.filter(r => r.rating === 'SELL').length;
  const holds = reports.filter(r => r.rating === 'HOLD').length;

  const activeFilters = ratingFilter.length + (modelFilter ? 1 : 0);

  return (
    <>
      {/* Stats */}
      {reports.length > 0 && (
        <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
          <div className="card" style={{ padding: '1rem', minWidth: '120px' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Coverage</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{reports.length}</div>
          </div>
          <div className="card" style={{ padding: '1rem', minWidth: '140px' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Buy / Hold / Sell</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              <span style={{ color: 'var(--status-up)' }}>{buys}</span>{' / '}
              <span style={{ color: 'var(--status-warning)' }}>{holds}</span>{' / '}
              <span style={{ color: 'var(--status-down)' }}>{sells}</span>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Search size={15} color="var(--text-tertiary)" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search tickers…"
              className="input"
              style={{ paddingLeft: '2rem', width: '200px', fontSize: '0.8rem' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Rating filter pills */}
          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            {(['BUY', 'HOLD', 'SELL'] as const).map(r => {
              const active = ratingFilter.includes(r);
              return (
                <button
                  key={r}
                  onClick={() => toggleRating(r)}
                  style={{
                    fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.55rem',
                    borderRadius: '0.25rem', cursor: 'pointer',
                    border: `1px solid ${active ? ratingColors[r] : 'var(--border-subtle)'}`,
                    backgroundColor: active ? ratingBg[r] : 'transparent',
                    color: active ? ratingColors[r] : 'var(--text-tertiary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>

          {/* Model filter */}
          {models.length > 1 && (
            <select
              value={modelFilter}
              onChange={e => setModel(e.target.value)}
              className="input"
              style={{ fontSize: '0.8rem', paddingRight: '1.5rem', width: 'auto', cursor: 'pointer' }}
            >
              <option value="">All models</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}

          {/* Clear filters */}
          {activeFilters > 0 && (
            <button
              onClick={() => { setRating([]); setModel(""); }}
              style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textDecoration: 'underline', cursor: 'pointer' }}
            >
              Clear filters
            </button>
          )}

          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
            {loading ? 'Loading…' : `${filtered.length} of ${reports.length}`}
          </span>
        </div>

        {loading && (
          <div style={{ padding: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: 'var(--text-tertiary)' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.875rem' }}>Loading reports…</span>
          </div>
        )}

        {error && (
          <div style={{ padding: '2rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: 'var(--status-down)', fontSize: '0.875rem' }}>Failed to load: {error}</span>
            <button onClick={loadReports} style={{ color: 'var(--accent-primary)', fontSize: '0.875rem', textDecoration: 'underline', cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  {['Ticker', 'Rating', 'Model', 'Filing', 'Date'].map(col => (
                    <th key={col} style={{ padding: '0.875rem 1.5rem', fontWeight: 500 }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
                      backgroundColor: selected?.id === r.id ? 'var(--bg-surface-hover)' : undefined,
                      transition: 'background-color 0.15s ease',
                    }}
                    className="hover-bg-transition"
                  >
                    <td style={{ padding: '0.875rem 1.5rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{r.ticker}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{r.company}</div>
                    </td>
                    <td style={{ padding: '0.875rem 1.5rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: 600,
                        backgroundColor: ratingBg[r.rating] || ratingBg.HOLD,
                        color: ratingColors[r.rating] || ratingColors.HOLD,
                      }}>
                        {r.rating}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{r.model}</td>
                    <td style={{ padding: '0.875rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {r.filing_form}{r.filing_date ? ` · ${r.filing_date}` : ''}
                    </td>
                    <td style={{ padding: '0.875rem 1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {r.analysis_date?.split('T')[0] || ''}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                      No reports match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Backdrop */}
      {selected && (
        <div onClick={closePanel} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40, animation: 'fadeIn 0.2s ease' }} />
      )}

      {/* Slide-in panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(480px, 92vw)',
        backgroundColor: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-subtle)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        transform: selected ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: selected ? '-8px 0 40px rgba(0,0,0,0.4)' : 'none',
      }}>
        {selected && (
          <>
            <div style={{
              padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selected.ticker}</span>
                  <span style={{
                    padding: '0.2rem 0.55rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 600,
                    backgroundColor: ratingBg[selected.rating] || ratingBg.HOLD,
                    color: ratingColors[selected.rating] || ratingColors.HOLD,
                  }}>
                    {selected.rating}
                  </span>
                </div>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{selected.company}</span>
              </div>
              <button onClick={closePanel} style={{ padding: '0.35rem', borderRadius: '0.375rem', color: 'var(--text-tertiary)', flexShrink: 0 }} className="hover-bg-transition">
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  { label: 'Rating',   value: selected.rating },
                  { label: 'Model',    value: selected.model },
                  { label: 'Filing',   value: `${selected.filing_form}${selected.filing_date ? ' · ' + selected.filing_date : ''}` },
                  { label: 'Date',     value: selected.analysis_date?.split('T')[0] || '' },
                  { label: 'Analysts', value: selected.analysts?.join(', ') || '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ backgroundColor: 'var(--bg-base)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500 }}>{value}</div>
                  </div>
                ))}
              </div>

              <Link
                href={`/stock/${selected.ticker}`}
                onClick={closePanel}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
              >
                <ExternalLink size={15} /> View Full Report & Chart
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
