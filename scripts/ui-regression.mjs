import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/app/globals.css', 'utf8');
const chart = readFileSync('src/components/Chart.tsx', 'utf8');
const stockPage = readFileSync('src/app/stock/[ticker]/page.tsx', 'utf8');

const outlineNavRule = /\.report-outline-card nav\s*\{[^}]*max-height:\s*calc\(100vh - 12rem\)[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/s;
assert.match(css, outlineNavRule, 'report map nav should scroll independently on desktop');

assert.match(chart, /fixLeftEdge:\s*true/, 'chart should clamp the left edge');
assert.match(chart, /fixRightEdge:\s*true/, 'chart should clamp the right edge');
assert.match(chart, /rightOffset:\s*0/, 'chart should not reserve whitespace after the latest bar');

assert.doesNotMatch(stockPage, /displayStart/, 'stock detail should not restrict display to a one-year window');
assert.match(stockPage, /getTiingoStockData\(ticker,\s*undefined,\s*today\)/, 'stock detail should request the longest Tiingo history available');

console.log('ui regression passed');
