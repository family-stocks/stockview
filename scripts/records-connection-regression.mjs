import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = ts.transpileModule(readFileSync(new URL('../src/lib/records-connection.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function connect(env) {
 const module = {exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,process:{env},require:id=>id==='server-only'?{}:require(id)});
 return module.exports.recordsConnection();
}
const hosted=connect({VERCEL:'1',RESEARCH_API_URL:'https://old.ngrok-free.dev/run',RESEARCH_API_KEY:'read'});
assert.equal(hosted.base,'https://stockconnect-mac.tail446f24.ts.net/stockconnect');
assert.equal(hosted.headers.Authorization,'Bearer read');
const oldDirect=connect({VERCEL:'1',STOCKCONNECT_RECORDS_URL:'https://old.ngrok.app',RESEARCH_API_KEY:'read'});
assert.equal(oldDirect.base,hosted.base);
const direct=connect({STOCKCONNECT_RECORDS_URL:'http://192.168.50.37:8081',STOCKCONNECT_RECORDS_API_KEY:'local'});
assert.equal(direct.base,'http://192.168.50.37:8081');
assert.equal(direct.headers.Authorization,'Bearer local');
const custom=connect({VERCEL:'1',STOCKCONNECT_RECORDS_URL:'https://records.example',STOCKCONNECT_RECORDS_API_KEY:'custom'});
assert.equal(custom.base,'https://records.example');
assert.throws(()=>connect({VERCEL:'1'}),/not configured/);
console.log('hosted Funnel routing, old tunnel migration, direct configuration and missing-key checks passed');
