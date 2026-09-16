// Cross-browser / cross-skin smoke test + timings for the WikiTerm gadget.
// Usage: npm run matrix   (then: npm run summary)
// Browsers: Google Chrome (installed app, via channel 'chrome'), plus Playwright's
// Firefox and WebKit builds: npx playwright install firefox webkit.
// Filter with BROWSERS=chrome,firefox and SKINS=vector,minerva.
// Loads a real ar.wikipedia article (anonymous), injects the gadget from the
// working tree, and drives it: entry point -> dialog (lazy OOUI load) ->
// search -> expand -> citation popup -> "show more".
const fs = require('fs');
const path = require('path');
const pw = require('playwright');

const REPO = path.join(__dirname, '..');
const GADGET_JS = fs.readFileSync(path.join(REPO, 'Gadget-WikiTerm.js'), 'utf8');
const GADGET_CSS = fs.readFileSync(path.join(REPO, 'Gadget-WikiTerm.css'), 'utf8');
const PAGE = 'https://ar.wikipedia.org/wiki/%D8%AD%D8%A7%D8%B3%D9%88%D8%A8'; // حاسوب
const OUT = path.join(__dirname, 'out');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const QUERY = 'computer';

const BROWSERS = [
  ['chrome', () => pw.chromium.launch({ channel: 'chrome' })],
  ['firefox', () => pw.firefox.launch()],
  ['webkit', () => pw.webkit.launch()],
];
const DESKTOP = { width: 1280, height: 800 };
const CASES = [
  { skin: 'vector-2022', viewport: DESKTOP },
  { skin: 'vector-2022', viewport: DESKTOP, night: true, label: 'vector-2022-night' },
  { skin: 'vector', viewport: DESKTOP },
  { skin: 'monobook', viewport: DESKTOP },
  { skin: 'timeless', viewport: DESKTOP },
  { skin: 'minerva', viewport: { width: 390, height: 844 }, mobile: true },
];

async function runCase(browserName, browser, c) {
  const label = c.label || c.skin;
  const r = { browser: browserName, skin: label, ok: false, pageErrors: [], consoleErrors: [], steps: {} };
  const ctxOpts = { viewport: c.viewport, locale: 'ar' };
  if (c.mobile) { ctxOpts.hasTouch = true; if (browserName !== 'firefox') ctxOpts.isMobile = true; }
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => r.pageErrors.push(String(e.message || e).split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') r.consoleErrors.push(m.text().split('\n')[0]); });
  const shot = (suffix) => page.screenshot({ path: path.join(SHOTS, `${browserName}-${label}${suffix}.png`) }).catch(() => {});
  try {
    const url = PAGE + '?useskin=' + c.skin + (c.night ? '&vectornightmode=1' : '');
    let t = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.mw && mw.loader && mw.loader.getState('mediawiki.util') === 'ready', null, { timeout: 60000 });
    r.steps.pageLoadMs = Date.now() - t;
    r.steps.errorsBeforeGadget = r.pageErrors.length;

    await page.addStyleTag({ content: GADGET_CSS });
    const resBefore = await page.evaluate(() => performance.getEntriesByType('resource').map((x) => x.name));
    await page.addScriptTag({ content: GADGET_JS });

    const trigger = page.locator('.wikiterm-trigger, #ca-wikiterm a').first();
    await trigger.waitFor({ state: 'attached', timeout: 15000 });
    r.steps.entryPoint = await page.evaluate(() => {
      const el = document.querySelector('.wikiterm-trigger, #ca-wikiterm a');
      const p = el.closest('#p-cactions, #p-tb, #p-personal, .vector-user-links, .minerva-user-navigation');
      return p ? (p.id || p.className.split(' ')[0]) : 'unknown';
    });
    r.steps.oouiLoadedAtPageLoad = await page.evaluate(() => mw.loader.getState('oojs-ui-core'));

    // Vector legacy / Timeless keep the "المزيد" menu collapsed: open it first.
    let visible = await trigger.isVisible();
    if (!visible) {
      const heading = page.locator('#p-cactions label, #p-cactions .vector-menu-heading, #p-cactions h3, #p-cactions .mw-portlet-body').first();
      if (await heading.count()) { await heading.hover().catch(() => {}); await heading.click({ force: true }).catch(() => {}); }
      await page.waitForTimeout(300);
      visible = await trigger.isVisible();
    }
    r.steps.entryVisible = visible;
    await shot('-entry');

    t = Date.now();
    if (visible) await trigger.click(); else await page.evaluate(() => document.querySelector('.wikiterm-trigger, #ca-wikiterm a').click());
    r.steps.clickMethod = visible ? 'real click' : 'js click';
    const input = page.locator('.wikiterm-search-input input').first();
    await input.waitFor({ state: 'visible', timeout: 60000 });
    r.steps.dialogOpenMs = Date.now() - t;
    r.steps.lazyLoad = await page.evaluate((before) => {
      const es = performance.getEntriesByType('resource').filter((x) => !before.includes(x.name) && x.name.includes('load.php'));
      return { requests: es.length, transferBytes: es.reduce((s, x) => s + (x.transferSize || 0), 0) };
    }, resBefore);

    t = Date.now();
    await input.fill(QUERY);
    await input.press('Enter');
    const card = page.locator('.wikiterm-result-card').first();
    await card.waitFor({ state: 'visible', timeout: 90000 });
    r.steps.searchMs = Date.now() - t;
    r.steps.cardsRendered = await page.locator('.wikiterm-result-card').count();
    r.steps.showMoreVisible = await page.locator('.wikiterm-show-more').first().isVisible();

    await card.locator('.wikiterm-result-header').click();
    await card.locator('.wikiterm-variant-item').first().waitFor({ state: 'visible', timeout: 15000 });
    r.steps.variantsShown = await card.locator('.wikiterm-variant-item').count();

    const cite = card.locator('.wikiterm-citation-button a').first();
    if (await cite.count()) {
      await cite.click();
      const ta = page.locator('.wikiterm-citation-popup textarea').first();
      await ta.waitFor({ state: 'visible', timeout: 15000 });
      r.steps.citation = await ta.inputValue();
    }
    await shot('');

    if (r.steps.showMoreVisible) {
      await page.locator('.wikiterm-show-more a').first().click();
      await page.waitForTimeout(500);
      r.steps.cardsAfterShowMore = await page.locator('.wikiterm-result-card').count();
    }
    // Close via the dialog's safe action; the dialog must disappear.
    await page.locator('.oo-ui-processDialog-actions-safe a').first().click();
    await input.waitFor({ state: 'hidden', timeout: 15000 });
    r.steps.closed = true;
    r.ok = true;
  } catch (e) {
    r.steps.failedAt = e.message.split('\n')[0];
    await shot('-FAILED');
  }
  r.pageErrorsMentionWikiTerm = r.pageErrors.some((m) => /wikiterm/i.test(m));
  await ctx.close();
  return r;
}

(async () => {
  const results = [];
  const wantB = process.env.BROWSERS ? process.env.BROWSERS.split(',') : null;
  const wantS = process.env.SKINS ? process.env.SKINS.split(',') : null;
  for (const [name, launch] of BROWSERS.filter(([n]) => !wantB || wantB.includes(n))) {
    const browser = await launch();
    results.push({ browser: name, version: browser.version() });
    for (const c of CASES.filter((x) => !wantS || wantS.includes(x.label || x.skin))) {
      const r = await runCase(name, browser, c);
      results.push(r);
      console.log(JSON.stringify(r));
    }
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'matrix_results.json'), JSON.stringify(results, null, 2));
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
