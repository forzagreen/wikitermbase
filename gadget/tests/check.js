// Deterministic checks (no network):
//  1. Size budget: the gadget must stay small at page load (it is enabled by default).
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

// 1. size budget
for (const [file, max] of Object.entries(BUDGET)) {
  const src = read(file);
  const size = gz(src);
  console.log(`${file}: ${src.length} bytes raw, ${size} bytes gzipped (budget ${max})`);
  if (size > max) { fail(`${file} exceeds its gzipped size budget`); }
}

// 2. things a default gadget must not do
const js = read('Gadget-WikiTerm.js');
if (/console\./.test(js)) { fail('console.* call found'); }
if (/mw\.loader\.using\(\s*DIALOG_MODULES/.test(js) === false) { fail('OOUI is no longer loaded lazily via DIALOG_MODULES'); }

process.exit(failed ? 1 : 0);
