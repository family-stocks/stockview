import Link from 'next/link';
import { getTriggerResults, triggerTypes, outcomes } from '@/lib/triggers-server';
import Refresh from './Refresh';
import './triggers.css';

const decisions: Record<string, string> = { QUEUE_FULL_REPORT: 'Approved for full research', SKIP: 'Skipped', DEFER: 'Deferred' };
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function sources(value: unknown): {url: string; finding: string}[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const url = typeof item === 'string' ? item : text(item?.url);
    try { if (!['https:', 'http:'].includes(new URL(url).protocol)) return []; } catch { return []; }
    return [{url, finding: text(item?.finding)}];
  });
}
export default async function TriggersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const single = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  const ticker = single('ticker').trim().toUpperCase();
  const type = Object.hasOwn(triggerTypes, single('type')) ? single('type') : '';
  const outcome = Object.hasOwn(outcomes, single('outcome')) ? single('outcome') : '';
  const page = Math.max(1, Math.min(100000, Number.parseInt(single('page'), 10) || 1));
  const validTicker = !ticker || /^[A-Z0-9.^_-]{1,32}$/.test(ticker);
  const query = new URLSearchParams({limit: '25', offset: String((page - 1) * 25)});
  if (ticker) query.set('ticker', ticker);
  if (type) query.set('trigger_type', type);
  if (outcome) query.set('outcome', outcome);
  let data: Awaited<ReturnType<typeof getTriggerResults>> | null = null;
  let error = validTicker ? '' : 'Enter a valid ticker symbol.';
  if (!error) { try { data = await getTriggerResults(query); } catch { error = 'Trigger results are temporarily unavailable. Try refreshing shortly.'; } }
  const pageUrl = (next: number) => {
    const q = new URLSearchParams({ticker, type, outcome, page: String(next)});
    return `/triggers?${q}`;
  };
  return <div className="container triggers-page">
    <header className="trigger-heading"><div><span className="eyebrow">Research activity</span><h1>Trigger results</h1><p>See what triggered research, what it decided, and whether a full report was requested.</p></div><Refresh /></header>
    <form action="/triggers" className="card trigger-filters">
      <label>Ticker<input className="input" name="ticker" defaultValue={ticker} placeholder="All tickers" maxLength={32} /></label>
      <label>Trigger<select className="input" name="type" defaultValue={type}><option value="">All triggers</option>{Object.entries(triggerTypes).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Submission<select className="input" name="outcome" defaultValue={outcome}><option value="">All outcomes</option>{Object.entries(outcomes).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="btn btn-primary" type="submit">Apply filters</button><Link className="btn btn-secondary" href="/triggers">Reset</Link>
    </form>
    <p className="trigger-note">Newest first · Times in UTC · “Sent” means accepted by the earnings agent, not that the report is finished. This view shows audited research decisions; scan-level exclusions are not included.</p>
    {error && <div className="card trigger-error" role="alert">{error}</div>}
    {data && <>
      <p role="status">{data.total.toLocaleString()} matching results</p>
      {!data.items.length && <div className="card">No results on this page. Try another filter or return to <Link href={pageUrl(1)}>page 1</Link>.</div>}
      <div className="trigger-list">{data.items.map(row => {
        const links = sources(row.assessment?.sources);
        const rationale = text(row.assessment?.rationale);
        const risks = Array.isArray(row.assessment?.risks) ? row.assessment.risks.filter((r): r is string => typeof r === 'string') : [];
        const signals = Array.isArray(row.evidence?.signals) ? row.evidence.signals.filter((s): s is string => typeof s === 'string') : [];
        return <article className="card trigger-result" key={row.id}>
          <div className="trigger-result-heading"><div><strong className="trigger-ticker">{row.ticker}</strong><span>{triggerTypes[row.trigger_type] || row.trigger_type}</span></div><span className={`trigger-outcome outcome-${row.outcome.toLowerCase()}`}>{outcomes[row.outcome] || row.outcome}</span></div>
          <div className="trigger-meta"><time dateTime={row.evaluated_at}>{new Date(row.evaluated_at).toLocaleString('en-GB', {timeZone: 'UTC'})} UTC</time><span>{decisions[row.research_decision || ''] || row.research_decision || 'No research decision recorded'}</span>{signals.length > 0 && <span>{signals.join(' · ').replaceAll('_', ' ')}</span>}</div>
          <p>{row.reason || rationale || 'No rationale recorded.'}</p>
          <details><summary>Research details{links.length ? ` · ${links.length} sources` : ''}</summary>
            {rationale && rationale !== row.reason && <p>{rationale}</p>}
            {risks.length > 0 && <><h3>Risks</h3><ul>{risks.map((risk,i) => <li key={i}>{risk}</li>)}</ul></>}
            {links.length > 0 && <><h3>Sources</h3><ul>{links.map((source,i) => <li key={i}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.finding || source.url}</a></li>)}</ul></>}
            {row.submitted_job_id && <p>Job ID: <code>{row.submitted_job_id}</code></p>}
            <details><summary>Signal evidence</summary><pre>{JSON.stringify(row.evidence, null, 2)}</pre></details>
          </details>
        </article>;
      })}</div>
      <nav className="trigger-pagination" aria-label="Results pages">{page > 1 && <Link className="btn btn-secondary" href={pageUrl(page - 1)}>Previous</Link>}<span>Page {page} of {Math.max(1, Math.ceil(data.total / 25))}</span>{page * 25 < data.total && <Link className="btn btn-secondary" href={pageUrl(page + 1)}>Next</Link>}</nav>
    </>}
  </div>;
}
