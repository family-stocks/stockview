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

const checkpoints = normalizeRow({
  horizon_length: '15', horizon_unit: 'trading_days',
  review_deadline_utc: '2026-10-17T08:45:00Z', reassessment_max_wait_hours: 120,
  price_triggers: [{ price: '1070.41', direction: 'crosses_above', confirmation: 'daily_close', rationale: 'Technical repair' }, { price: 'invalid' }],
  event_triggers: [{ condition: 'Earnings release', rationale: 'Check guidance' }, null],
});
assert.equal(checkpoints.horizon_length, 15);
assert.equal(checkpoints.reassessment_max_wait_hours, 120);
assert.equal(checkpoints.price_triggers.length, 1);
assert.equal(checkpoints.price_triggers[0].price, 1070.41);
assert.equal(checkpoints.price_triggers[0].confirmation, 'daily_close');
assert.equal(checkpoints.event_triggers.length, 1);
assert.equal(normalizeRow({}).price_triggers.length, 0);
assert.equal(normalizeRow({}).horizon_length, null);
const nestedCheckpoints = normalizeRow({ trade_plan: {
  horizon_length: 20, horizon_unit: 'trading_days',
  reassessment: { max_wait_hours: 72, event_triggers: [{ condition: 'CPI release' }] },
} });
assert.equal(nestedCheckpoints.horizon_length, 20);
assert.equal(nestedCheckpoints.reassessment_max_wait_hours, 72);
assert.equal(nestedCheckpoints.event_triggers[0].condition, 'CPI release');
assert.equal(normalizeRow({ position_pct: 0 }).position_pct, 0);
assert.equal(normalizeRow({ position_pct: '6.7' }).position_pct, 6.7);
assert.equal(normalizeRow({ trade_plan: { position_pct: 10 } }).position_pct, 10);
assert.equal(normalizeRow({}).position_pct, null);
console.log('checkpoint normalization regression passed');

assert.equal(normalizeRow({ entry_price: '114.34' }).entry_price, 114.34);
assert.equal(normalizeRow({ entry_price: 0 }).entry_price, 0);
assert.equal(normalizeRow({ trade_plan: { entry_price: 112.5 } }).entry_price, 112.5);
assert.equal(normalizeRow({ entry_price: 114, trade_plan: { entry_price: 112 } }).entry_price, 114);
assert.equal(normalizeRow({}).entry_price, null);
console.log('entry price regression passed');
