import { getReportsSnapshot } from '@/lib/records-server';

export async function GET() {
  try {
    const snapshot = await getReportsSnapshot();
    return Response.json(snapshot.data, {headers: {
      'Cache-Control': 'no-store',
      'X-Reports-Fetched-At': snapshot.fetchedAt,
      'X-Reports-Stale': String(Boolean(snapshot.stale)),
    }});
  } catch {
    return Response.json({error: 'Reports are temporarily unavailable.'}, {status: 503});
  }
}
