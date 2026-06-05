import { NextResponse } from 'next/server';

function getBaseUrl() {
  const raw = process.env.RESEARCH_API_URL || '';
  return raw.replace(/\/run\/?$/, '');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: 'RESEARCH_API_URL is not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(`${baseUrl}/status/${jobId}`, {
      headers: {
        ...(process.env.RESEARCH_API_KEY ? { 'Authorization': `Bearer ${process.env.RESEARCH_API_KEY}` } : {}),
      },
      // Don't cache — callers need fresh status
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json({ error: data?.error || `API error ${res.status}` }, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
