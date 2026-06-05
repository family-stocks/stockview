"use client";

import { useState, useRef } from "react";
import { X, UploadCloud, CheckCircle, AlertCircle } from "lucide-react";
import Papa from "papaparse";

const STORAGE_KEY = 'research_jobs';

function loadJobs(): any[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveJob(job: any) {
  const jobs = loadJobs();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([job, ...jobs]));
  window.dispatchEvent(new Event('research-jobs-updated'));
}

export default function UploadModal({ onClose }: { onClose: () => void }) {
  const [tickers, setTickers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [failedTickers, setFailedTickers] = useState<string[]>([]);
  const abortRef = useRef(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        const possibleKeys = ['Ticker', 'ticker', 'Symbol', 'symbol'];
        let targetKey = '';
        if (data.length > 0) {
          targetKey = Object.keys(data[0]).find(k => possibleKeys.includes(k)) || '';
        }

        if (!targetKey) {
          setError("Could not find a 'Ticker' or 'Symbol' column in the CSV.");
          return;
        }

        const parsedTickers = data
          .map(row => row[targetKey]?.trim().toUpperCase())
          .filter(t => t && /^[A-Z.\-]{1,10}$/.test(t));

        const uniqueTickers = Array.from(new Set(parsedTickers)) as string[];

        if (uniqueTickers.length === 0) {
          setError("No valid tickers found in the column.");
        } else {
          setTickers(uniqueTickers);
          setError(null);
        }
      },
      error: (err) => {
        setError(err.message);
      }
    });
  };

  const handleSubmit = async () => {
    abortRef.current = false;
    setProgress({ sent: 0, total: tickers.length });
    setFailedTickers([]);
    setError(null);

    const failed: string[] = [];

    for (let i = 0; i < tickers.length; i++) {
      if (abortRef.current) break;

      const ticker = tickers[i];
      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: ticker }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Status ${res.status}`);

        const jobId = data.job_id || data.jobId || data.id || `${ticker}-${Date.now()}`;
        saveJob({
          jobId,
          tickers: [ticker],
          submittedAt: new Date().toISOString(),
          status: normaliseStatus(data),
          raw: data,
        });
      } catch {
        failed.push(ticker);
      }

      setProgress({ sent: i + 1, total: tickers.length });
    }

    setFailedTickers(failed);
    setIsSuccess(true);
  };

  const handleCancel = () => {
    abortRef.current = true;
    onClose();
  };

  const isSubmitting = progress !== null && !isSuccess;
  const pct = progress ? Math.round((progress.sent / progress.total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 17, 21, 0.8)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
      padding: '1rem'
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
        <button onClick={handleCancel} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', color: 'var(--text-tertiary)' }}>
          <X size={20} />
        </button>

        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Trigger Research</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Upload a CSV with a "Ticker" column to run the research API.</p>
        </div>

        {isSuccess ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 0' }}>
            <CheckCircle size={48} color="var(--status-up)" />
            <p style={{ fontWeight: 500 }}>
              {progress!.total - failedTickers.length} / {progress!.total} tickers submitted
            </p>
            {failedTickers.length > 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--status-down)' }}>
                {failedTickers.length} failed: {failedTickers.join(', ')}
              </p>
            )}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Jobs are tracked on the <a href="/jobs" style={{ color: 'var(--accent-primary)' }}>Jobs page</a>.
            </p>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        ) : isSubmitting ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
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
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>{pct}% complete</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {!tickers.length ? (
              <div style={{ border: '2px dashed var(--border-strong)', borderRadius: '0.5rem', padding: '3rem 2rem', textAlign: 'center', transition: 'border-color 0.2s ease' }} className="hover-bg-transition">
                <UploadCloud size={32} color="var(--text-tertiary)" style={{ margin: '0 auto 1rem' }} />
                <p style={{ fontWeight: 500, marginBottom: '0.5rem' }}>Select a CSV file to upload</p>
                <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} id="csv-upload" />
                <label htmlFor="csv-upload" className="btn btn-secondary" style={{ display: 'inline-flex' }}>
                  Browse Files
                </label>
                {error && <p style={{ color: 'var(--status-down)', fontSize: '0.875rem', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}><AlertCircle size={14} /> {error}</p>}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-base)', borderRadius: '0.5rem', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 500 }}>Found {tickers.length} tickers</span>
                    <button onClick={() => setTickers([])} style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', textDecoration: 'underline' }}>Clear</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', padding: '0.5rem 0' }}>
                    {tickers.map(t => (
                      <span key={t} style={{ padding: '0.25rem 0.5rem', backgroundColor: 'var(--bg-surface-hover)', borderRadius: '0.25rem', fontSize: '0.875rem', border: '1px solid var(--border-strong)' }}>{t}</span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                  <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSubmit}>
                    Run Research
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function normaliseStatus(raw: Record<string, unknown>): string {
  const s = String(raw.status || raw.state || '').toLowerCase();
  if (s.includes('complet') || s.includes('done') || s.includes('success')) return 'completed';
  if (s.includes('fail') || s.includes('error')) return 'failed';
  if (s.includes('run') || s.includes('progress')) return 'running';
  if (s.includes('pend') || s.includes('queue') || s.includes('waiting')) return 'pending';
  return 'pending';
}
