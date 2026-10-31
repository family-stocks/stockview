import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const entries = new Map();
let credential = 'test-key-a';
const mocks = {
  'server-only': {},
  './records-connection': {recordsConnection: () => ({base: 'https://records.example', headers: {Authorization: credential}})},
  'next/cache': {unstable_cache: (loader, keys) => async (...args) => {
    const key = JSON.stringify([keys, args]);
    if (!entries.has(key)) entries.set(key, await loader(...args));
    return entries.get(key);
  }},
};
const module = {exports: {}};
const source = ts.transpileModule(readFileSync(new URL('../src/lib/snapshot-cache.ts', import.meta.url), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
vm.runInNewContext(source, {module, exports: module.exports, Buffer, require: id => mocks[id] ?? require(id)});
const {cachedSnapshot} = module.exports;
let value = 'old-report';
let failed = false;
const read = cachedSnapshot('regression', 60, async ticker => {
  if (failed) throw new Error('offline');
  return {ticker, value};
}, true);
assert.equal((await read('AVT')).data.value, 'old-report');
value = 'new-report';
assert.equal((await read('AVT')).data.value, 'new-report');
assert.equal((await read('ASTS')).data.ticker, 'ASTS');
failed = true;
const fallback = await read('AVT');
assert.equal(fallback.stale, true);
assert.equal(fallback.data.value, 'old-report');
await assert.rejects(read('UNCACHED'), /offline/);
credential = 'test-key-b';
await assert.rejects(read('AVT'), /offline/);
console.log('fresh-first, outage fallback, ticker isolation and credential isolation passed');
