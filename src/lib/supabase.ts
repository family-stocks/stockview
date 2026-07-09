import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Columns safe to fetch in the list view (no large text fields)
export const BASE_LIST_COLUMNS =
  'id,ticker,sec_company_name,analysis_date,sec_filing_form,sec_filing_date,final_decision,llm_provider,deep_think_llm,analysts,created_at'

export const TRADE_PLAN_COLUMNS = 'target_price,stop_loss_price'

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

export function isTradePlanColumnError(error: unknown): boolean {
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message)
    : String(error || '')
  return message.includes('target_price') || message.includes('stop_loss_price')
}

export function normalizeRow(row: unknown): ResearchReport {
  const record: ReportRow = row && typeof row === 'object' ? row as ReportRow : {}

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
    target_price: nullableNumber(record.target_price ?? record.price_target ?? record.fair_value),
    stop_loss_price: nullableNumber(record.stop_loss_price ?? record.stop_loss),
    thesis: textValue(record.final_trade_decision) || undefined,
    full_report_markdown: textValue(record.full_report_markdown) || undefined,
  }
}
