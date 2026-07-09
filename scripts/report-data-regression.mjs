import assert from 'node:assert/strict';
import { mergeRowsById, normalizeRow } from '../src/lib/supabase.ts';

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

console.log('report data regression passed');
