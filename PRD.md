# StockConnect — Research Frontend PRD

**Owner:** Nic Tanze
**Status:** Draft v0.1
**Last updated:** 2026-06-05
**Stack:** Next.js (App Router, TypeScript) · Supabase · external Research API · price/indicator service

---

## 1. Summary

A personal web app to browse equity research reports stored in Supabase, trigger new
research by uploading a CSV of tickers to an external Research API, and inspect each
stock through its latest report plus a price chart overlaid with technical indicators
(30-period SMA and Bollinger Bands).

The app is single-user (Nic), read-mostly, and security-sensitive in one specific way:
it holds a **Research API key** and **Supabase keys** that must never reach the browser.
All privileged calls go through Next.js server routes.

---

## 2. Goals / Non-goals

**Goals**
- See at a glance which reports exist in Supabase, newest first, searchable by ticker.
- Upload a CSV, extract the `Ticker` column, and fan those tickers out to the Research API.
- Track the status of a submitted batch (queued → running → done/failed).
- For any ticker: view its latest report and a price chart with SMA-30 + Bollinger Bands.
- Keep all API keys server-side.

**Non-goals (v1)**
- Multi-user auth / sharing.
- Editing or authoring reports in the UI (reports are produced by the Research API).
- Live order placement or any brokerage action.
- Real-time streaming prices (periodic fetch is enough for the tactical horizon).

---

## 3. Primary user flows

1. **Browse** — Land on the dashboard, see all available reports as a sortable/filterable
   table (latest report per ticker), click a row to open detail.
2. **Trigger research** — Open the Upload panel, drop a CSV, confirm the parsed ticker list,
   submit. Watch a batch progress view; completed tickers appear in the dashboard.
3. **Inspect a stock** — From a row, open detail: latest report (rating, conviction,
   valuation, thesis, catalysts, risks) on one side, price chart with SMA-30 + Bollinger
   Bands on the other.

---

## 4. Architecture overview

```
Browser (React client components)
   │  fetch (no secrets)
   ▼
Next.js server (Route Handlers / Server Components)  ── holds all secrets
   ├── Supabase  (anon key + RLS for reads; service role only if writes needed)
   ├── Research API  (RESEARCH_API_KEY, RESEARCH_API_URL)  ← CSV-triggered runs
   └── Price/Indicator service  (ported from your Python function)
```

Rule of thumb: **the browser never talks to Supabase-with-writes, the Research API, or the
price source directly.** It only calls our own `/api/*` routes, which inject secrets.

---

## 5. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 App Router, TypeScript | Server Components for data fetch |
| DB / backend | Supabase (`@supabase/supabase-js`) | reports + job tracking |
| CSV parsing | `papaparse` | parse client-side or in a route |
| Charts | `lightweight-charts` (TradingView) | candlesticks + SMA/BB overlays; `recharts` fallback for simple lines |
| Icons | `lucide-react` | |
| Styling | CSS variables + module/global CSS | dark "research terminal" theme already designed |

---

## 6. Data model (Supabase)

> Final column names TBD — see Open Questions. Proposed shape below; the app maps real
> columns onto its render shape via a single `normalizeRow()` adapter, so renaming is cheap.

**`research_reports`** — one row per generated report
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| ticker | text | indexed |
| company | text | |
| sector | text | |
| rating | text or int | "Buy/Hold/Sell" or numeric score |
| conviction | numeric | 0–100 |
| current_price | numeric | snapshot at report time |
| fair_value | numeric | blended target |
| dcf / ddm / graham | numeric | per-method values |
| thesis | text | LLM write-up |
| catalysts | jsonb / text[] | |
| risks | jsonb / text[] | |
| horizon | text | e.g. "3–6 mo" |
| model | text | model/version that produced it |
| created_at | timestamptz | "latest" = max(created_at) per ticker |

"Latest report per ticker" via a view or a `distinct on (ticker) ... order by ticker, created_at desc`.

**`research_jobs`** — tracks CSV-triggered runs (recommended if the Research API is async)
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| batch_id | uuid | groups one CSV upload |
| ticker | text | |
| status | text | `queued` / `running` / `done` / `failed` |
| report_id | uuid (fk) | set when complete |
| error | text | |
| submitted_at / completed_at | timestamptz | |

**`csv_batches`** (optional) — `id, filename, uploaded_at, ticker_count, status`.

---

## 7. Feature specs

### 7.1 Reports browser (dashboard)
- Server Component fetches latest-per-ticker reports from Supabase.
- Table columns: ticker, rating, conviction bar, price, fair value, upside %, updated.
- Controls: text search (ticker/company), rating filter pills, sort (conviction / upside / ticker / updated).
- Summary chips: covered count, # buys, # sell/avoid, avg conviction.
- Row click → stock detail panel.
- Empty/loading/error states.

### 7.2 CSV upload → trigger research
- Upload panel accepts `.csv` (drag-drop + file picker).
- Parse with papaparse; locate the **`Ticker`** column (case-insensitive; also accept `Symbol`).
  - Dedupe, uppercase, strip blanks, basic validation (e.g. `^[A-Z.\-]{1,10}$`).
  - Show a confirm step: "Submit N tickers: AAPL, MSFT, …" with the option to deselect.
- On submit, POST the ticker list to **`/api/research`** (our server route), which:
  1. Reads `RESEARCH_API_URL` + `RESEARCH_API_KEY` from server env.
  2. Calls the Research API per ticker (or batch, if it supports it).
  3. **Sync API:** writes returned reports into `research_reports` (upsert on ticker+created_at).
     **Async API:** creates `research_jobs` rows (status `queued`) and returns a `batch_id`;
     results land later via webhook or poll.
- Batch progress view (polls `/api/research/status?batch_id=…` or subscribes to Supabase
  Realtime on `research_jobs`).
- Errors per ticker surfaced individually; partial success is fine.

> Decision needed: is the Research API **sync** (returns the report in the response) or
> **async** (returns a job id; result arrives later)? This determines whether we need the
> jobs table + polling/webhook. See Open Questions.

### 7.3 Stock detail (latest report + price/indicators)
- Two-pane (or stacked on mobile): **report** | **chart**.
- Report pane: rating badge, conviction, price vs fair value, upside, horizon, thesis,
  catalysts, risks, valuation bars (DCF/DDM/Graham vs current price), model + timestamp.
- Chart pane: candlestick (or close-line) price series with overlays:
  - **30-period SMA** line.
  - **Bollinger Bands** (middle = SMA(period), upper/lower = middle ± k·σ).
- Data via **`/api/indicators?ticker=…&lookback=…`** (server route, ported from your Python).
- Lookback selector (e.g. 6M / 1Y / 2Y) and toggle for each overlay.

---

## 8. Integrations & API contracts

### 8.1 Supabase
- Reads use the **anon key** behind a SELECT-only RLS policy → safe even if it reaches the
  client, and since reads happen in Server Components the key stays server-side anyway.
- Any writes from the CSV flow run in server routes. If writes need to bypass RLS, use the
  **service role key — server-only, never `NEXT_PUBLIC_`**. Prefer a tight RLS insert policy
  over shipping the service role around.
- Example read RLS:
  ```sql
  alter table research_reports enable row level security;
  create policy "read reports" on research_reports for select using (true);
  ```

### 8.2 Research API (proxied)
Server route `app/api/research/route.ts`. Env: `RESEARCH_API_URL`, `RESEARCH_API_KEY`.
Proposed internal contract (adjust to the real API):
```
POST /api/research            body: { tickers: string[] }
  → sync:  { reports: ResearchReport[] }        // we upsert into Supabase
  → async: { batch_id: string, jobs: {ticker,status}[] }

GET  /api/research/status?batch_id=…
  → { batch_id, jobs: {ticker,status,report_id?}[] }
```
The route attaches the API key as a header (e.g. `Authorization: Bearer …` or `x-api-key`)
— exact auth header TBD from the API docs.

### 8.3 Price / indicator service (Python → TS port)
This is the piece that depends on **your Python function**. Two viable shapes:

- **A. Port the whole thing to a Next.js route** — if the function only does HTTP fetch +
  math (e.g. pull OHLCV from Tiingo, compute indicators), I rewrite it in TS as
  `app/api/indicators/route.ts`. No Python runtime needed. Cleanest for Vercel.
- **B. Keep Python, call it over HTTP** — if it leans on pandas/numpy/ArcticDB/your FastAPI
  serving layer, expose it as a small FastAPI endpoint (you already run FastAPI in
  StockConnect) and have the Next.js route proxy to it. Avoids reimplementing ArcticDB access.

**Recommendation:** if the function's data source is the **Tiingo REST API**, go with A
(full TS port). If it reads from **ArcticDB/DuckDB locally**, go with B (proxy to FastAPI on
your M1 Docker box), because that storage layer isn't reachable from a serverless TS route.

Proposed route contract either way:
```
GET /api/indicators?ticker=AAPL&lookback=1Y
  → {
      ticker,
      candles: { t: ISODate, o, h, l, c, v }[],
      sma30:   ({ t, value } | null)[],
      bollinger: { period, k, middle[], upper[], lower[] }
    }
```

---

## 9. Technical indicators — reference port

Standard, source-independent math. I'll align exact parameters/edge-handling to your Python
once you share it; the one real gotcha is the **standard-deviation degrees of freedom** (see note).

```ts
// 30-period simple moving average. Returns null until the window fills.
export function sma(values: number[], period = 30): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

// Bollinger Bands. Convention: middle = SMA(period), bands = middle ± k * stddev.
// NOTE: pandas `.rolling().std()` defaults to SAMPLE stddev (ddof=1); classic Bollinger
// uses POPULATION stddev (ddof=0). Set `sample` to whatever your Python used so the
// bands line up exactly.
export function bollinger(
  values: number[],
  period = 20,
  k = 2,
  sample = false, // false = population (ddof=0), true = sample (ddof=1)
) {
  const middle = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { upper.push(null); lower.push(null); continue; }
    const w = values.slice(i - period + 1, i + 1);
    const m = middle[i] as number;
    const denom = sample ? period - 1 : period;
    const variance = w.reduce((s, v) => s + (v - m) ** 2, 0) / denom;
    const sd = Math.sqrt(variance);
    upper.push(m + k * sd);
    lower.push(m - k * sd);
  }
  return { period, k, middle, upper, lower };
}
```

Defaults shown are the common ones (SMA-30 for the moving average; Bollinger on 20-period,
2σ). If your Python uses Bollinger on a 30-period window, change `period`. Confirm:
window length, `k`, and the ddof choice.

---

## 10. Security & secrets

| Secret | Where | Rule |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | server + client | safe with RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | never `NEXT_PUBLIC_`; only in route handlers if writes need it |
| `RESEARCH_API_KEY` / `RESEARCH_API_URL` | server only | only used inside `/api/research` |
| price source creds (e.g. Tiingo) | server only | only inside `/api/indicators` |

Additional: validate/whitelist uploaded CSV content (size cap, ticker regex), rate-limit the
research trigger to avoid accidental fan-out blowups, and never echo secrets in error responses.

---

## 11. Non-functional requirements

- **Performance:** dashboard reports fetched server-side with `revalidate` (≈5 min) caching;
  indicator responses cached per `ticker+lookback` for a few minutes.
- **Resilience:** per-ticker failures don't fail the whole batch; clear error surfacing.
- **Deploy:** Vercel for the full-TS path; if using the FastAPI proxy (option B), the app can
  also run on your headless M1 Docker box alongside the existing StockConnect services.
- **Observability:** log batch submissions and job transitions.

---

## 12. Milestones

1. **M0 — Scaffold + reports browser** (mostly done): Next.js app, Supabase read, dashboard
   on real `research_reports`. *Blocked on:* final schema.
2. **M1 — CSV → research trigger:** upload/parse UI, `/api/research` proxy, jobs table +
   status view. *Blocked on:* Research API contract (sync/async, auth header, payload).
3. **M2 — Stock detail + chart:** `/api/indicators` route, SMA-30 + Bollinger overlays.
   *Blocked on:* your Python function + its data source.
4. **M3 — Polish:** caching, rate limits, error states, mobile layout.

---

## 13. Open questions / inputs needed from you

To finish M1–M2 I need:

1. **Python indicator function** — the actual source, so I can either port it to TS (option A)
   or wrap it in FastAPI and proxy (option B). Tell me its data source (Tiingo REST vs
   ArcticDB/DuckDB) — that decides A vs B.
2. **Bollinger parameters** — window length, `k`, and whether your Python used sample or
   population stddev (pandas default is sample).
3. **Research API contract** — base URL shape, auth header name, request body, and whether it
   responds **synchronously** with the report or **asynchronously** with a job id. This decides
   whether we build the jobs table + polling/webhook.
4. **`research_reports` schema** — real column names + a sample row, so I lock the
   `normalizeRow()` mapping.
5. **Price data for the chart** — does the indicator function also return the OHLCV series, or
   do I fetch candles separately (and from where)?