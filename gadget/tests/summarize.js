// Prints the matrix results as a Markdown table.
// Usage: node tests/summarize.js tests/out/matrix_results.json
const fs = require('fs');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const versions = Object.fromEntries(rows.filter((r) => r.version).map((r) => [r.browser, r.version]));
const cases = rows.filter((r) => !r.version);
console.log('| Browser | Skin | Entry point | OOUI at page load | Dialog open (ms) | Lazy load (KB) | Search (ms) | Cards | Expand | Citation | Show more | Close | JS errors | Result |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of cases) {
  const s = r.steps;
  console.log(`| ${r.browser} ${versions[r.browser]} | ${r.skin} | ${s.entryPoint} | ${s.oouiLoadedAtPageLoad} | ${s.dialogOpenMs} | ${s.lazyLoad ? Math.round(s.lazyLoad.transferBytes / 1024) : '-'} | ${s.searchMs} | ${s.cardsRendered} | ${s.variantsShown ? 'ok' : '-'} | ${s.citation ? 'ok' : '-'} | ${s.cardsAfterShowMore || '-'} | ${s.closed ? 'ok' : '-'} | ${r.pageErrors.length} | ${r.ok ? 'PASS' : 'FAIL: ' + s.failedAt} |`);
}
console.log(`\n${cases.filter((r) => r.ok).length}/${cases.length} passed; page errors mentioning WikiTerm: ${cases.filter((r) => r.pageErrorsMentionWikiTerm).length}; console errors: ${JSON.stringify(cases.flatMap((r) => r.consoleErrors))}`);
