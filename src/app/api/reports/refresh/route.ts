import { createHmac, timingSafeEqual } from 'node:crypto';
import { recordsConnection } from '@/lib/records-connection';
import { refreshReportsSnapshot } from '@/lib/records-server';

export const maxDuration = 120;

export async function POST(request: Request) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '');
  if (!match) return Response.json({error: 'Unauthorized.'}, {status: 401});

  try {
    const {headers} = recordsConnection();
    const expected = createHmac('sha256', headers.Authorization.slice('Bearer '.length))
      .update('stockview:POST:/api/reports/refresh:v1').digest();
    if (!timingSafeEqual(Buffer.from(match[1], 'hex'), expected)) {
      return Response.json({error: 'Unauthorized.'}, {status: 401});
    }
    return Response.json(await refreshReportsSnapshot());
  } catch (error) {
    console.error('StockView report refresh failed:', error);
    return Response.json({error: 'Report refresh failed.'}, {status: 503});
  }
}
