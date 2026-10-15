import { getLocalReports } from '@/lib/records-server';

export async function GET() {
  try {
    return Response.json(await getLocalReports(), {headers: {'Cache-Control': 'no-store'}});
  } catch {
    return Response.json({error: 'Reports are temporarily unavailable.'}, {status: 503});
  }
}
