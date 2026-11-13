import { createHash, timingSafeEqual } from 'node:crypto';
import { refreshReportsSnapshot } from '@/lib/records-server';

export const maxDuration = 120;

export async function POST(request: Request) {
  const secret = process.env.STOCKVIEW_REPORT_REFRESH_SECRET;
  const authorization = request.headers.get('authorization') ?? '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!secret || !timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))) {
    return Response.json({error: 'Unauthorized.'}, {status: 401});
  }

  try {
    return Response.json(await refreshReportsSnapshot());
  } catch (error) {
    console.error('StockView report refresh failed:', error);
    return Response.json({error: 'Report refresh failed.'}, {status: 503});
  }
}
