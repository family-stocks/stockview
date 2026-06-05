import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Columns safe to fetch in the list view (no large text fields)
export const LIST_COLUMNS =
  'id,ticker,sec_company_name,analysis_date,sec_filing_form,sec_filing_date,final_decision,llm_provider,deep_think_llm,analysts,created_at'

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
  // Only present when the full row is fetched (stock detail page)
  thesis?: string
  full_report_markdown?: string
}

export function normalizeRow(row: any): ResearchReport {
  return {
    id: row.id || '',
    ticker: row.ticker || 'UNKNOWN',
    company: row.sec_company_name || 'Unknown Company',
    rating: row.final_decision || 'HOLD',
    model: row.deep_think_llm || row.llm_provider || 'Unknown',
    analysts: Array.isArray(row.analysts) ? row.analysts : [],
    filing_form: row.sec_filing_form || '',
    filing_date: row.sec_filing_date || '',
    analysis_date: row.analysis_date || row.created_at || new Date().toISOString(),
    created_at: row.created_at || new Date().toISOString(),
    thesis: row.final_trade_decision,
    full_report_markdown: row.full_report_markdown,
  }
}
