import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Columns safe to fetch in the list view (no large text fields)
export const BASE_LIST_COLUMNS =
  'id,ticker,sec_company_name,analysis_date,sec_filing_form,sec_filing_date,final_decision,llm_provider,deep_think_llm,analysts,created_at'

export const TRADE_PLAN_COLUMNS = 'target_price,stop_loss_price'

export const TRADE_PLAN_LOOKUP_COLUMNS = `id,${TRADE_PLAN_COLUMNS}`

export const TRADE_PLAN_TICKER_LOOKUP_COLUMNS = `id,ticker,created_at,${TRADE_PLAN_COLUMNS}`

export const LIST_COLUMNS = `${BASE_LIST_COLUMNS},${TRADE_PLAN_COLUMNS}`

export const BASE_FULL_COLUMNS =
  'id,ticker,sec_company_name,analysis_date,sec_filing_form,sec_filing_date,' +
  'final_decision,llm_provider,deep_think_llm,analysts,created_at,' +
  'final_trade_decision,full_report_markdown'

export const FULL_COLUMNS = `${BASE_FULL_COLUMNS},${TRADE_PLAN_COLUMNS}`

export type ResearchReport = {
  id: string
  ticker: string
  company: string
  rating: string
  model: string
  analysts: string[]
  filing_form: string
  filing_date: string
  analysis_date: string
  created_at: string
  target_price: number | null
  stop_loss_price: number | null
  // Only present when the full row is fetched (stock detail page)
  thesis?: string
  full_report_markdown?: string
}

type ReportRow = Record<string, unknown>

const TARGET_PRICE_KEYS = ['target_price', 'targetPrice', 'price_target', 'fair_value']
const STOP_LOSS_PRICE_KEYS = ['stop_loss_price', 'stopLossPrice', 'stop_loss']

function isReportRow(value: unknown): value is ReportRow {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function rowId(row: unknown): string | null {
  if (!isReportRow(row)) return null
  const id = row.id
  if (typeof id === 'string' && id) return id
  if (typeof id === 'number' && Number.isFinite(id)) return String(id)
  return null
}

function rowTicker(row: unknown): string | null {
  if (!isReportRow(row)) return null
  const ticker = row.ticker
  if (typeof ticker !== 'string' || !ticker.trim()) return null
  return ticker.trim().toUpperCase()
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function objectValue(value: unknown): ReportRow | null {
  if (isReportRow(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const parsed: unknown = JSON.parse(value)
    return isReportRow(parsed) ? parsed : null
  } catch {
    return null
  }
}

function numberFrom(record: ReportRow | null, keys: string[]): number | null {
  if (!record) return null

  for (const key of keys) {
    const value = nullableNumber(record[key])
    if (value !== null) return value
  }

  return null
}

export function isTradePlanColumnError(error: unknown): boolean {
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message)
    : String(error || '')
  return message.includes('target_price') || message.includes('stop_loss_price')
}

export function normalizeRow(row: unknown): ResearchReport {
  const record: ReportRow = isReportRow(row) ? row : {}
  const finalTradeDecision = objectValue(record.final_trade_decision)

  return {
    id: textValue(record.id),
    ticker: textValue(record.ticker, 'UNKNOWN').toUpperCase(),
    company: textValue(record.sec_company_name, 'Unknown Company'),
    rating: textValue(record.final_decision, 'HOLD').toUpperCase(),
    model: textValue(record.deep_think_llm) || textValue(record.llm_provider, 'Unknown'),
    analysts: Array.isArray(record.analysts)
      ? record.analysts.filter((analyst): analyst is string => typeof analyst === 'string')
      : [],
    filing_form: textValue(record.sec_filing_form),
    filing_date: textValue(record.sec_filing_date),
    analysis_date: textValue(record.analysis_date) || textValue(record.created_at) || new Date().toISOString(),
    created_at: textValue(record.created_at) || new Date().toISOString(),
    target_price: numberFrom(record, TARGET_PRICE_KEYS) ?? numberFrom(finalTradeDecision, TARGET_PRICE_KEYS),
    stop_loss_price: numberFrom(record, STOP_LOSS_PRICE_KEYS) ?? numberFrom(finalTradeDecision, STOP_LOSS_PRICE_KEYS),
    thesis: textValue(record.final_trade_decision) || undefined,
    full_report_markdown: textValue(record.full_report_markdown) || undefined,
  }
}

export function reportRowId(row: unknown): string | null {
  return rowId(row)
}

export function reportRowTicker(row: unknown): string | null {
  return rowTicker(row)
}

export function mergeRowsById(baseRows: unknown[], patchRows: unknown[]): unknown[] {
  const patches = new Map<string, ReportRow>()

  for (const row of patchRows) {
    const id = rowId(row)
    if (id && isReportRow(row)) patches.set(id, row)
  }

  return baseRows.map(row => {
    const id = rowId(row)
    const patch = id ? patches.get(id) : undefined
    if (!patch || !isReportRow(row)) return row
    return { ...row, ...patch }
  })
}

export function mergeRowsByTicker(baseRows: unknown[], patchRows: unknown[]): unknown[] {
  const patches = new Map<string, ReportRow>()

  for (const row of patchRows) {
    const ticker = rowTicker(row)
    if (ticker && isReportRow(row) && !patches.has(ticker)) patches.set(ticker, row)
  }

  return baseRows.map(row => {
    const ticker = rowTicker(row)
    const patch = ticker ? patches.get(ticker) : undefined
    if (!patch || !isReportRow(row)) return row

    const merged = { ...row, ...patch }
    if (row.id !== undefined) merged.id = row.id
    return merged
  })
}
