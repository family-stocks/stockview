import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { normalizeTickers, quoteBatches, parseIexQuotes, parseLatestQuotes } from '../src/lib/quotes.ts';

const tickers = Array.from({ length: 205 }, (_, i) => `S${i}`);
assert.deepEqual(quoteBatches(tickers).map(batch => batch.length), [100, 100, 5]);
assert.deepEqual(quoteBatches(tickers).flat(), tickers);
assert.deepEqual(normalizeTickers(' aapl, AAPL, brk.b, bad!'), ['AAPL', 'BRK.B']);
const prices = parseIexQuotes(['AAPL', 'BRK.B', 'EMPTY', 'MISSING'], [
  { ticker: 'aapl', last: 210.25, tngoLast: 211, timestamp: '2026-10-14T15:00:00Z', lastSaleTimestamp: '2026-10-13T20:00:00Z' },
  { ticker: 'brk-b', last: null, tngoLast: 450.12, timestamp: '2026-10-14T15:00:00Z' },
  { ticker: 'EMPTY', last: 0, tngoLast: null },
]);
assert.equal(prices.AAPL.price, 210.25);
assert.equal(prices.AAPL.date, '2026-10-13');
assert.equal(prices.AAPL.source, 'IEX last');
assert.equal(prices['BRK.B'].price, 450.12);
assert.equal(prices['BRK.B'].source, 'Tiingo reference');
assert.equal(prices.EMPTY.status, 'unavailable');
assert.equal(prices.MISSING.status, 'unavailable');
assert.throws(() => parseIexQuotes(['AAPL'], { error: 'invalid' }));

for (const timestamp of ['2026-10-14T12:00:00Z', '2026-10-14T22:00:00Z']) {
  const extended = parseLatestQuotes(['AAPL'], [
    { ticker: 'aapl', last: 200, lastSaleTimestamp: '2026-10-13T20:00:00Z' },
  ], [{ ticker: 'aapl', tngoLast: 215, timestamp }]);
  assert.equal(extended.AAPL.price, 215);
  assert.equal(extended.AAPL.timestamp, timestamp);
  assert.equal(extended.AAPL.source, 'Tiingo consolidated');
}
assert.equal(parseLatestQuotes(['AAPL'], [{ ticker: 'aapl', last: 210, lastSaleTimestamp: '2026-10-14T15:00:00Z' }], []).AAPL.price, 210);
assert.equal(parseLatestQuotes(['AAPL'], [], [{ ticker: 'aapl', lqRefPrice: 212, timestamp: '2026-10-14T15:00:00Z' }]).AAPL.price, 212);
assert.equal(parseLatestQuotes(['AAPL'], [], [{ ticker: 'aapl', tngoLast: 212, timestamp: 'invalid' }]).AAPL.status, 'unavailable');

// Run the actual route with mocked upstream requests, without live credentials.
let source = readFileSync('src/app/api/prices/route.ts', 'utf8');
source = source.replace('"next/server"', JSON.stringify(new URL('../node_modules/next/server.js', import.meta.url).href));
source = source.replace('"@/lib/quotes"', JSON.stringify(new URL('../src/lib/quotes.ts', import.meta.url).href));
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const originalFetch = globalThis.fetch;
const originalKey = process.env.TIINGO_API_KEY;
const request = tickers => new Request(`http://localhost/api/prices?tickers=${encodeURIComponent(tickers)}`);
try {
  delete process.env.TIINGO_API_KEY;
  assert.equal((await GET(request('AAPL'))).status, 503);
  assert.equal((await GET(request(''))).status, 400);
  const many = Array.from({ length: 101 }, (_, i) => `S${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}`);
  assert.equal((await GET(request(many.join(',')))).status, 400);
  process.env.TIINGO_API_KEY = 'test-only';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.ok(['https://api.tiingo.com/iex/AAPL,BRK-B', 'https://api.tiingo.com/tiingo/equity/intraday/AAPL,BRK-B'].includes(url));
    assert.equal(options.next.revalidate, 60);
    return Response.json([{ ticker: 'aapl', last: null, tngoLast: 210, timestamp: '2026-10-14T15:00:00Z' }]);
  };
  const result = await GET(request('AAPL,BRK.B'));
  assert.equal(result.status, 200);
  assert.equal(calls, 2);
  const payload = await result.json();
  assert.equal(payload.prices.AAPL.price, 210);
  assert.equal(payload.prices['BRK.B'].status, 'unavailable');
  // An entitlement failure on consolidated data must preserve IEX fallback.
  globalThis.fetch = async url => url.includes('/tiingo/equity/')
    ? new Response('', { status: 403 })
    : Response.json([{ ticker: 'aapl', last: 209, lastSaleTimestamp: '2026-10-14T15:00:00Z' }]);
  assert.equal((await (await GET(request('AAPL'))).json()).prices.AAPL.price, 209);
  globalThis.fetch = async () => new Response('', { status: 429 });
  assert.equal((await GET(request('AAPL'))).status, 502);
  globalThis.fetch = async () => { throw new Error('network failure'); };
  assert.equal((await GET(request('AAPL'))).status, 502);
  globalThis.fetch = async () => Response.json({ error: 'bad payload' });
  assert.equal((await GET(request('AAPL'))).status, 502);
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.TIINGO_API_KEY;
  else process.env.TIINGO_API_KEY = originalKey;
}
console.log('quote regression passed');
