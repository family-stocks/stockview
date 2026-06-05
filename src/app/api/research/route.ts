import { NextResponse } from 'next/server';

function getBaseUrl() {
  // RESEARCH_API_URL ends with "/run", strip it to get the base
  const raw = process.env.RESEARCH_API_URL || '';
  return raw.replace(/\/run\/?$/, '');
}

export async function POST(request: Request) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: 'RESEARCH_API_URL is not configured' }, { status: 500 });
  }

  let ticker: string;
  try {
    const body = await request.json();
    ticker = body.tickers;
    if (typeof ticker !== 'string' || !ticker.trim()) {
      return NextResponse.json({ error: 'tickers must be a non-empty string' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const res = await fetch(`${baseUrl}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.RESEARCH_API_KEY ? { 'Authorization': `Bearer ${process.env.RESEARCH_API_KEY}` } : {}),
      },
      body: JSON.stringify({ ticker }),
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
