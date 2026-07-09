import assert from 'node:assert/strict';
import { mergeRowsById, mergeRowsByTicker, normalizeRow } from '../src/lib/supabase.ts';

const normalizedNumeric = normalizeRow({
  id: 'r1',
  ticker: 'aapl',
  sec_company_name: 'Apple Inc.',
  final_decision: 'BUY',
  target_price: 250,
  stop_loss_price: 180,
});

assert.equal(normalizedNumeric.target_price, 250);
assert.equal(normalizedNumeric.stop_loss_price, 180);

const normalizedStringNumeric = normalizeRow({
  id: 'r2',
  ticker: 'msft',
  target_price: '510.25',
  stop_loss_price: '420.5',
});

assert.equal(normalizedStringNumeric.target_price, 510.25);
assert.equal(normalizedStringNumeric.stop_loss_price, 420.5);

const merged = mergeRowsById(
  [{ id: 'r3', ticker: 'nvda', target_price: null, stop_loss_price: null }],
  [{ id: 'r3', target_price: 210, stop_loss_price: 165 }],
);

const normalizedMerged = normalizeRow(merged[0]);
assert.equal(normalizedMerged.target_price, 210);
assert.equal(normalizedMerged.stop_loss_price, 165);

const normalizedNestedTradeDecision = normalizeRow({
  id: 'r4',
  ticker: 'tsla',
  final_trade_decision: {
    target_price: 315.5,
    stop_loss_price: 240,
  },
});

assert.equal(normalizedNestedTradeDecision.target_price, 315.5);
assert.equal(normalizedNestedTradeDecision.stop_loss_price, 240);

const tickerMerged = mergeRowsByTicker(
  [{ id: 'latest-r5', ticker: 'amzn', target_price: null, stop_loss_price: null }],
  [{ id: 'report-r5', ticker: 'AMZN', target_price: 245, stop_loss_price: 198 }],
);

const normalizedTickerMerged = normalizeRow(tickerMerged[0]);
assert.equal(normalizedTickerMerged.target_price, 245);
assert.equal(normalizedTickerMerged.stop_loss_price, 198);

console.log('report data regression passed');
