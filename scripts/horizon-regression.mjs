import assert from 'node:assert/strict';
import { horizonEndDate } from '../src/lib/horizon.ts';

const report = { analysis_date: '2026-10-12', horizon_length: 30, horizon_unit: 'trading_days' };
assert.equal(horizonEndDate(report), '2026-11-23T00:00:00.000Z');
assert.equal(horizonEndDate({ ...report, analysis_date: '2026-10-16', horizon_length: 1 }), '2026-10-19T00:00:00.000Z');
assert.equal(horizonEndDate({ ...report, horizon_unit: 'calendar_days' }), '2026-11-11T00:00:00.000Z');
assert.equal(horizonEndDate({ ...report, analysis_date: '2026-01-31', horizon_length: 1, horizon_unit: 'months' }), '2026-02-28T00:00:00.000Z');
assert.equal(horizonEndDate({ ...report, horizon_length: null }), '');
assert.equal(horizonEndDate({ ...report, analysis_date: 'invalid' }), '');
assert.equal(horizonEndDate({ ...report, horizon_unit: 'unknown' }), '');
console.log('horizon date regression passed');
