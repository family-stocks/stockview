"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { X, Play, RefreshCw, Loader2, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'unknown';

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
  if (s === 'failed')    return <XCircle    size={15} color="var(--status-down)" />;
  if (s === 'running')   return <Loader2    size={15} color="var(--accent-primary)" style={{ animation: 'spin 1s linear infinite' }} />;
  if (s === 'pending')   return <Clock      size={15} color="var(--status-warning)" />;
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
  if (s.includes('fail') || s.includes('error'))  return 'failed';
  if (s.includes('run') || s.includes('progress')) return 'running';
  if (s.includes('pend') || s.includes('queue') || s.includes('waiting')) return 'pending';
  return 'unknown';
}

export default function JobsClient() {
  const [jobs, setJobs]           = useState<Job[]>([]);
  const [tickerInput, setInput]   = useState("");
  const [pendingTickers, setPending] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load from localStorage on mount
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

  // Polling loop: every 5 s, poll all non-terminal jobs
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

  // Add ticker on Enter or comma
  const handleTickerKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTicker(tickerInput);
    }
  };

  const addTicker = (raw: string) => {
    const ticker = raw.trim().toUpperCase().replace(/,/g, '');
    if (!ticker) return;
    setPending(prev => prev.includes(ticker) ? prev : [...prev, ticker]);
    setInput("");
  };

  const removeTicker = (t: string) => setPending(prev => prev.filter(x => x !== t));

  const submitRun = async () => {
    const tickers = pendingTickers.length ? pendingTickers : tickerInput.trim().toUpperCase() ? [tickerInput.trim().toUpperCase()] : [];
    if (!tickers.length) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || 'Request failed');
        return;
      }

      const jobId = data.job_id || data.jobId || data.id || String(Date.now());
      const newJob: Job = {
        jobId,
        tickers,
        submittedAt: new Date().toISOString(),
        status: normaliseStatus(data),
        raw: data,
      };

      setJobs(prev => {
        const updated = [newJob, ...prev];
        saveJobs(updated);
        return updated;
      });
      setPending([]);
      setInput("");
    } catch (err) {
      setSubmitError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const removeJob = (jobId: string) => {
    setJobs(prev => { const updated = prev.filter(j => j.jobId !== jobId); saveJobs(updated); return updated; });
  };

  const manualRefresh = (job: Job) => pollStatus(job);

  const activeCount = jobs.filter(j => !TERMINAL.has(j.status)).length;

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

      {/* Submit form */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          New Run
        </div>

        {/* Ticker chips */}
        {pendingTickers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {pendingTickers.map(t => (
              <span key={t} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.2rem 0.5rem 0.2rem 0.65rem',
                borderRadius: '0.25rem',
                backgroundColor: 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: 'var(--accent-primary)',
                fontSize: '0.8rem', fontWeight: 600,
              }}>
                {t}
                <button onClick={() => removeTicker(t)} style={{ color: 'inherit', opacity: 0.7, lineHeight: 1, cursor: 'pointer' }}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input row */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input"
            placeholder="Type a ticker and press Enter (e.g. AAPL)"
            value={tickerInput}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={handleTickerKey}
            onBlur={() => addTicker(tickerInput)}
            style={{ flex: 1, minWidth: '220px', fontSize: '0.875rem' }}
            disabled={submitting}
          />
          <button
            onClick={submitRun}
            disabled={submitting || (pendingTickers.length === 0 && !tickerInput.trim())}
            className="btn btn-primary"
            style={{ gap: '0.5rem', flexShrink: 0 }}
          >
            {submitting
              ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</>
              : <><Play size={15} /> Run Research</>
            }
          </button>
        </div>

        {submitError && (
          <div style={{ fontSize: '0.8rem', color: 'var(--status-down)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <XCircle size={14} /> {submitError}
          </div>
        )}
      </div>

      {/* Jobs list */}
      {jobs.length > 0 && (
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
                  {['Status', 'Tickers', 'Job ID', 'Submitted', ''].map((col, i) => (
                    <th key={i} style={{ padding: '0.75rem 1.5rem', fontWeight: 500 }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.jobId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {/* Status */}
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

                    {/* Tickers */}
                    <td style={{ padding: '0.875rem 1.5rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {job.tickers.map(t => (
                          <Link
                            key={t}
                            href={`/stock/${t}`}
                            style={{
                              fontSize: '0.75rem', fontWeight: 600,
                              color: job.status === 'completed' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                              textDecoration: job.status === 'completed' ? 'underline' : 'none',
                            }}
                          >
                            {t}
                          </Link>
                        ))}
                      </div>
                    </td>

                    {/* Job ID */}
                    <td style={{ padding: '0.875rem 1.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      <span title={job.jobId}>
                        {job.jobId.length > 20 ? `${job.jobId.slice(0, 8)}…${job.jobId.slice(-6)}` : job.jobId}
                      </span>
                    </td>

                    {/* Submitted */}
                    <td style={{ padding: '0.875rem 1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {new Date(job.submittedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '0.875rem 1rem', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        {!TERMINAL.has(job.status) && (
                          <button
                            onClick={() => manualRefresh(job)}
                            title="Refresh status"
                            style={{ padding: '0.3rem', borderRadius: '0.25rem', color: 'var(--text-tertiary)' }}
                            className="hover-bg-transition"
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => removeJob(job.jobId)}
                          title="Remove"
                          style={{ padding: '0.3rem', borderRadius: '0.25rem', color: 'var(--text-tertiary)' }}
                          className="hover-bg-transition"
                        >
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
      )}

      {jobs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
          No jobs submitted yet. Add tickers above and click Run Research.
        </div>
      )}
    </div>
  );
}
