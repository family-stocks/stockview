import 'server-only';
import { recordsConnection } from './records-connection';

export const triggerTypes: Record<string, string> = { price: 'Report price', news: 'News', earnings: 'Earnings calendar', discovery: 'Daily discovery' };
export const outcomes: Record<string, string> = { SENT: 'Sent', NOT_SENT: 'Not sent', PENDING: 'Pending', UNCERTAIN: 'Needs review', UNKNOWN: 'Unknown' };
export interface TriggerResult {
  id: number; ticker: string; trigger_type: string; outcome: string;
  research_decision: string | null; reason: string | null; submitted_job_id: string | null;
  evaluated_at: string; evidence: Record<string, unknown>; assessment: Record<string, unknown>;
}
export async function getTriggerResults(query: URLSearchParams): Promise<{items: TriggerResult[]; total: number}> {
  const { base, headers } = recordsConnection();
  const response = await fetch(`${base}/v1/trigger-results?${query}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error('Trigger results are temporarily unavailable.');
  const data = await response.json();
  if (!Array.isArray(data.items) || !Number.isInteger(data.total)) throw new Error('Invalid trigger response.');
  return data;
}
