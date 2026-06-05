"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { X, Play, RefreshCw, Loader2, CheckCircle, XCircle, Clock, AlertCircle, UploadCloud } from "lucide-react";
import Papa from "papaparse";

type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'unknown';
type Tab = 'single' | 'csv';

interface Job {
  jobId: string;
  tickers: string[];
  submittedAt: string;
  status: JobStatus;
  error?: string;
  raw?: Record<string, unknown>;
}

const STORAGE_KEY = 'research_jobs';
const TERMINAL = new Set<JobStatus>(['completed', 'failed']);

function statusIcon(s: JobStatus) {
  if (s === 'completed') return <CheckCircle size={15} color="var(--status-up)" />;
  if (s === 'failed')    return <XCircle     size={15} color="var(--status-down)" />;
  if (s === 'running')   return <Loader2     size={15} color="var(--accent-primary)" style={{ animation: 'spin 1s linear infinite' }} />;
  if (s === 'pending')   return <Clock       size={15} color="var(--status-warning)" />;
  return                        <AlertCircle size={15} color="var(--text-tertiary)" />;
}

function statusLabel(s: JobStatus) {
  return { completed: 'Completed', failed: 'Failed', running: 'Running', pending: 'Pending', unknown: 'Unknown' }[s];
}

function statusColor(s: JobStatus): string {
  return { completed: 'var(--status-up)', failed: 'var(--status-down)', running: 'var(--accent-primary)', pending: 'var(--status-warning)', unknown: 'var(--text-tertiary)' }[s];
}

function loadJobs(): Job[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveJobs(jobs: Job[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function normaliseStatus(raw: Record<string, unknown>): JobStatus {
  const s = String(raw.status || raw.state || '').toLowerCase();
  if (s.includes('complet') || s.includes('done') || s.includes('success')) return 'completed';
  if (s.includes('fail') || s.includes('error'))   return 'failed';
  if (s.includes('run') || s.includes('progress')) return 'running';
  if (s.includes('pend') || s.includes('queue') || s.includes('waiting')) return 'pending';
  return 'pending';
}

async function submitTicker(ticker: string): Promise<Job> {
  const res = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickers: ticker }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Status ${res.status}`);
  const jobId = data.job_id || data.jobId || data.id || `${ticker}-${Date.now()}`;
  return { jobId, tickers: [ticker], submittedAt: new Date().toISOString(), status: normaliseStatus(data), raw: data };
}

// ─── Single ticker tab ────────────────────────────────────────────────────────

function SingleTab({ onJobAdded }: { onJobAdded: (job: Job) => void }) {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTicker, setLastTicker] = useState<string | null>(null);

  const handleSubmit = async () => {
    const ticker = input.trim().toUpperCase();
    if (!ticker) return;
    setSubmitting(true);
    setError(null);
    try {
      const job = await submitTicker(ticker);
      onJobAdded(job);
      setLastTicker(ticker);
      setInput("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <input
          type="text"
          className="input"
          placeholder="Ticker symbol (e.g. AAPL)"
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={handleKey}
          disabled={submitting}
          style={{ flex: 1, fontSize: '0.875rem' }}
        />
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting || !input.trim()}
          style={{ flexShrink: 0, gap: '0.5rem' }}
        >
          {submitting
            ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</>
            : <><Play size={15} /> Run Research</>}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: '0.8rem', color: 'var(--status-down)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <XCircle size={14} /> {error}
        </div>
      )}
      {lastTicker && !error && (
        <div style={{ fontSize: '0.8rem', color: 'var(--status-up)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <CheckCircle size={14} /> {lastTicker} submitted — job added below
        </div>
      )}
    </div>
  );
}

// ─── CSV tab ──────────────────────────────────────────────────────────────────

function CsvTab({ onJobAdded }: { onJobAdded: (job: Job) => void }) {
  const [tickers, setTickers] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [failedTickers, setFailedTickers] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const abortRef = useRef(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDone(false);
    setProgress(null);
    setParseError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        const possibleKeys = ['Ticker', 'ticker', 'Symbol', 'symbol'];
        const targetKey = data.length > 0
          ? Object.keys(data[0]).find(k => possibleKeys.includes(k)) || ''
          : '';

        if (!targetKey) {
          setParseError("Could not find a 'Ticker' or 'Symbol' column in the CSV.");
          return;
        }

        const parsed = data
          .map(row => row[targetKey]?.trim().toUpperCase())
          .filter((t: string) => t && /^[A-Z.\-]{1,10}$/.test(t));

        const unique = Array.from(new Set(parsed)) as string[];
        if (unique.length === 0) {
          setParseError("No valid tickers found in the column.");
        } else {
          setTickers(unique);
        }
      },
      error: (err) => setParseError(err.message),
    });
  };

  const handleSubmit = async () => {
    abortRef.current = false;
    setProgress({ sent: 0, total: tickers.length });
    setFailedTickers([]);
    const failed: string[] = [];

    for (let i = 0; i < tickers.length; i++) {
      if (abortRef.current) break;
      const ticker = tickers[i];
      try {
        const job = await submitTicker(ticker);
        onJobAdded(job);
      } catch {
        failed.push(ticker);
      }
      setProgress({ sent: i + 1, total: tickers.length });
    }

    setFailedTickers(failed);
    setDone(true);
  };

  const reset = () => {
    setTickers([]);
    setProgress(null);
    setDone(false);
    setFailedTickers([]);
    setParseError(null);
  };

  const isSubmitting = progress !== null && !done;
  const pct = progress ? Math.round((progress.sent / progress.total) * 100) : 0;

  if (done) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1.5rem 0' }}>
        <CheckCircle size={40} color="var(--status-up)" />
        <p style={{ fontWeight: 500 }}>
          {progress!.total - failedTickers.length} / {progress!.total} tickers submitted
        </p>
        {failedTickers.length > 0 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--status-down)' }}>
            Failed: {failedTickers.join(', ')}
          </p>
        )}
        <button className="btn btn-secondary" onClick={reset}>Upload another</button>
      </div>
    );
  }

  if (isSubmitting) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Sending tickers…</span>
          <span style={{ fontWeight: 500 }}>{progress!.sent} / {progress!.total}</span>
        </div>
        <div style={{ height: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-base)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '4px',
            backgroundColor: 'var(--accent-primary)',
            width: `${pct}%`,
            transition: 'width 0.2s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{pct}% complete</span>
          <button className="btn btn-secondary" style={{ fontSize: '0.75rem' }} onClick={() => { abortRef.current = true; }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {tickers.length === 0 ? (
        <div style={{ border: '2px dashed var(--border-strong)', borderRadius: '0.5rem', padding: '2.5rem 2rem', textAlign: 'center' }}>
          <UploadCloud size={28} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem' }} />
          <p style={{ fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.875rem' }}>Select a CSV with a "Ticker" column</p>
          <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} id="csv-tab-upload" />
          <label htmlFor="csv-tab-upload" className="btn btn-secondary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
            Browse Files
          </label>
          {parseError && (
            <p style={{ color: 'var(--status-down)', fontSize: '0.8rem', marginTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
              <AlertCircle size={13} /> {parseError}
            </p>
          )}
        </div>
      ) : (
        <>
          <div style={{ padding: '0.875rem', backgroundColor: 'var(--bg-base)', borderRadius: '0.5rem', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>Found {tickers.length} tickers</span>
              <button onClick={reset} style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textDecoration: 'underline' }}>Clear</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '120px', overflowY: 'auto' }}>
              {tickers.map(t => (
                <span key={t} style={{ padding: '0.2rem 0.5rem', backgroundColor: 'var(--bg-surface-hover)', borderRadius: '0.25rem', fontSize: '0.8rem', border: '1px solid var(--border-strong)' }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSubmit} style={{ gap: '0.5rem' }}>
              <Play size={15} /> Run Research ({tickers.length})
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function JobsClient() {
  const [tab, setTab]     = useState<Tab>('single');
  const [jobs, setJobs]   = useState<Job[]>([]);
  const pollingRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setJobs(loadJobs()); }, []);

  const updateJob = useCallback((jobId: string, patch: Partial<Job>) => {
    setJobs(prev => {
      const updated = prev.map(j => j.jobId === jobId ? { ...j, ...patch } : j);
      saveJobs(updated);
      return updated;
    });
  }, []);

  const pollStatus = useCallback(async (job: Job) => {
    try {
      const res = await fetch(`/api/research/status?jobId=${encodeURIComponent(job.jobId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const status = normaliseStatus(data);
      updateJob(job.jobId, { status, raw: data, error: status === 'failed' ? (data.error || data.message || undefined) : undefined });
    } catch {
      // network blip — leave status unchanged
    }
  }, [updateJob]);

  useEffect(() => {
    pollingRef.current = setInterval(() => {
      setJobs(current => {
        const active = current.filter(j => !TERMINAL.has(j.status));
        active.forEach(j => pollStatus(j));
        return current;
      });
    }, 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [pollStatus]);

  const addJob = useCallback((job: Job) => {
    setJobs(prev => {
      const updated = [job, ...prev];
      saveJobs(updated);
      return updated;
    });
  }, []);

  const removeJob = (jobId: string) => {
    setJobs(prev => { const updated = prev.filter(j => j.jobId !== jobId); saveJobs(updated); return updated; });
  };

  const activeCount = jobs.filter(j => !TERMINAL.has(j.status)).length;

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '0.5rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    borderRadius: '0.375rem',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    background: tab === t ? 'var(--accent-primary)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--text-secondary)',
    border: 'none',
  });

  return (
    <div className="container flex" style={{ flexDirection: 'column', gap: '2rem' }}>
      <header>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 600, letterSpacing: '-0.025em' }}>Research Jobs</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          Submit tickers for analysis and track job progress.
          {activeCount > 0 && (
            <span style={{ marginLeft: '0.5rem', color: 'var(--accent-primary)' }}>
              {activeCount} job{activeCount !== 1 ? 's' : ''} in progress — polling every 5 s
            </span>
          )}
        </p>
      </header>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', backgroundColor: 'var(--bg-base)', borderRadius: '0.5rem', width: 'fit-content' }}>
          <button style={tabStyle('single')} onClick={() => setTab('single')}>Single</button>
          <button style={tabStyle('csv')} onClick={() => setTab('csv')}>CSV Upload</button>
        </div>

        {tab === 'single' && <SingleTab onJobAdded={addJob} />}
        {tab === 'csv'    && <CsvTab    onJobAdded={addJob} />}
      </div>

      {/* Job history */}
      {jobs.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Job History</span>
            <button
              onClick={() => { setJobs([]); saveJobs([]); }}
              style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textDecoration: 'underline', cursor: 'pointer' }}
            >
              Clear all
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  {['Status', 'Ticker', 'Job ID', 'Submitted', ''].map((col, i) => (
                    <th key={i} style={{ padding: '0.75rem 1.5rem', fontWeight: 500 }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.jobId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.875rem 1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {statusIcon(job.status)}
                        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: statusColor(job.status) }}>
                          {statusLabel(job.status)}
                        </span>
                      </div>
                      {job.error && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--status-down)', marginTop: '0.2rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.error}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '0.875rem 1.5rem' }}>
                      {job.tickers.map(t => (
                        <Link
                          key={t}
                          href={`/stock/${t}`}
                          style={{
                            fontSize: '0.875rem', fontWeight: 600,
                            color: job.status === 'completed' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            textDecoration: job.status === 'completed' ? 'underline' : 'none',
                          }}
                        >
                          {t}
                        </Link>
                      ))}
                    </td>

                    <td style={{ padding: '0.875rem 1.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      <span title={job.jobId}>
                        {job.jobId.length > 20 ? `${job.jobId.slice(0, 8)}…${job.jobId.slice(-6)}` : job.jobId}
                      </span>
                    </td>

                    <td style={{ padding: '0.875rem 1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {new Date(job.submittedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>

                    <td style={{ padding: '0.875rem 1rem', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        {!TERMINAL.has(job.status) && (
                          <button onClick={() => pollStatus(job)} title="Refresh status" style={{ padding: '0.3rem', borderRadius: '0.25rem', color: 'var(--text-tertiary)' }} className="hover-bg-transition">
                            <RefreshCw size={14} />
                          </button>
                        )}
                        <button onClick={() => removeJob(job.jobId)} title="Remove" style={{ padding: '0.3rem', borderRadius: '0.25rem', color: 'var(--text-tertiary)' }} className="hover-bg-transition">
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
          No jobs submitted yet.
        </div>
      )}
    </div>
  );
}
