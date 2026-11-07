import { getReportsSnapshot } from '@/lib/records-server';
import { withReportIndustries } from '@/lib/industries-server';

export async function GET() {
  try {
    const snapshot = await getReportsSnapshot();
    const reports = await withReportIndustries(snapshot.data, Boolean(snapshot.stale));
    return Response.json(reports, {headers: {
      'Cache-Control': 'no-store',
      'X-Reports-Fetched-At': snapshot.fetchedAt,
      'X-Reports-Stale': String(Boolean(snapshot.stale)),
    }});
  } catch {
    return Response.json({error: 'Reports are temporarily unavailable.'}, {status: 503});
  }
}
