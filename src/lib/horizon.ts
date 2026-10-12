import type { ResearchReport } from './supabase'

export function horizonEndDate(report: Pick<ResearchReport, 'analysis_date' | 'horizon_length' | 'horizon_unit'>): string {
  const date = new Date(report.analysis_date)
  const length = report.horizon_length
  if (!Number.isFinite(date.getTime()) || length === null || !Number.isSafeInteger(length) || length < 0) return ''

  switch (report.horizon_unit) {
    case 'trading_days':
      for (let remaining = length; remaining > 0;) {
        date.setUTCDate(date.getUTCDate() + 1)
        if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining--
      }
      break
    case 'days':
    case 'calendar_days':
      date.setUTCDate(date.getUTCDate() + length)
      break
    case 'weeks':
      date.setUTCDate(date.getUTCDate() + length * 7)
      break
    case 'months': {
      const day = date.getUTCDate()
      date.setUTCDate(1)
      date.setUTCMonth(date.getUTCMonth() + length)
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
      date.setUTCDate(Math.min(day, lastDay))
      break
    }
    default:
      return ''
  }
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}
