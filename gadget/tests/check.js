// Deterministic checks (no network):
//  1. SearchTerm.js is the gadget body wrapped in mw.loader.using() — nothing else may differ.
//  2. Size budget: the gadget must stay small at page load (it is enabled by default).
// Usage: npm run check
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const gz = (s) => zlib.gzipSync(s, { level: 9 }).length;
const BUDGET = { 'Gadget-WikiTerm.js': 10 * 1024, 'Gadget-WikiTerm.css': 3 * 1024 }; // gzipped bytes
let failed = false;
const fail = (msg) => { console.error('FAIL: ' + msg); failed = true; };

// 1. sync
const body = (src, open, close) => {
  const lines = src.split('\n');
  const i = lines.indexOf(open);
  const j = lines.lastIndexOf(close);
  if (i < 0 || j < 0 || j <= i) { return null; }
  return lines.slice(i + 1, j).join('\n');
};
const gadgetBody = body(read('Gadget-WikiTerm.js'), '( function () {', '}() );');
const scriptBody = body(read('SearchTerm.js'), "mw.loader.using( [ 'mediawiki.util' ] ).then( () => {", '} );');
if (!gadgetBody || !scriptBody) {
  fail('could not find the IIFE / mw.loader.using wrapper lines');
} else if (gadgetBody !== scriptBody) {
  fail('SearchTerm.js body differs from Gadget-WikiTerm.js — regenerate it (see README)');
} else {
  console.log('ok: SearchTerm.js body is identical to Gadget-WikiTerm.js');
}

// 2. size budget
for (const [file, max] of Object.entries(BUDGET)) {
  const src = read(file);
  const size = gz(src);
  console.log(`${file}: ${src.length} bytes raw, ${size} bytes gzipped (budget ${max})`);
  if (size > max) { fail(`${file} exceeds its gzipped size budget`); }
}

// 3. things a default gadget must not do
const js = read('Gadget-WikiTerm.js');
if (/console\./.test(js)) { fail('console.* call found'); }
if (/mw\.loader\.using\(\s*DIALOG_MODULES/.test(js) === false) { fail('OOUI is no longer loaded lazily via DIALOG_MODULES'); }

process.exit(failed ? 1 : 0);
