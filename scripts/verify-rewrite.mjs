// End-to-end check of the rewrite control on the cover (M3 / ADR 0007).
//
// Prerequisites are the same as verify-fixture.mjs:
//   npm run build
//   bash scripts/launch-test-chrome.sh          # Chrome with the extension, CDP :9239
//   python3 -m http.server 8787 -d test/fixtures
// Run:
//   node scripts/verify-rewrite.mjs
//
// What it asserts, and why it is worth running on a browser WITHOUT the model:
//   1. a covered post offers the rewrite control at all
//   2. pressing it leaves the 'rewriting' state rather than hanging there
//   3. when no rewrite can be produced, the cover STAYS. Failing to soften a
//      post is not a reason to show it to someone who has not asked to see it,
//      and that degradation is the part most likely to regress silently.
// Chrome for Testing never gets the Gemini Nano weights (ADR 0006), so there
// the run ends in 'rewrite-failed' and checks 3. Against the branded Chrome
// that has the model it ends in 'rewritten' and prints the text for a human to
// read — the wording itself is not something a script can grade.
//
//   NOBEEF_CDP_URL=http://127.0.0.1:9240 node scripts/verify-rewrite.mjs
//
// Not covered here: that the judging-in-progress cover under cover-first mode
// withholds the control. That path needs the config flipped in
// chrome.storage.sync first; for now it rests on the content script passing
// onRewrite only once a post has a verdict.

import { chromium } from 'playwright-core';

const CDP_URL = process.env.NOBEEF_CDP_URL ?? 'http://127.0.0.1:9239';
const FIXTURE_URL = process.env.NOBEEF_FIXTURE_URL ?? 'http://localhost:8787/x-timeline.html';
// Generous: the first run may download the ONNX model (~136MB) before any post is covered.
const COVER_TIMEOUT_MS = Number(process.env.NOBEEF_TIMEOUT_MS ?? 180_000);
// The rewrite itself is bounded by the adapter's own 20s timeout; leave headroom.
const REWRITE_TIMEOUT_MS = 40_000;
const POLL_MS = 500;

const COVER_SELECTOR = 'article[data-testid="tweet"] [data-nobeef-cover="1"]';

const failures = [];

/** Reads the cover state straight off the host element, outside the shadow root. */
function coverStates(page) {
  return page.$$eval(COVER_SELECTOR, (hosts) =>
    hosts.map((h) => h.getAttribute('data-nobeef-state') ?? 'unknown'),
  );
}

async function waitFor(page, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const states = await coverStates(page);
    if (predicate(states)) return states;
    await page.waitForTimeout(POLL_MS);
  }
  return null;
}

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const page = await context.newPage();
await page.goto(FIXTURE_URL, { waitUntil: 'domcontentloaded' });

const covered = await waitFor(page, (states) => states.length > 0, COVER_TIMEOUT_MS);
if (!covered) {
  console.log('no post was covered — nothing to rewrite. Is the extension loaded and the build fresh?');
  failures.push('no covers appeared');
}

// Playwright's CSS engine pierces open shadow roots, so the button inside the
// cover's shadow DOM is reachable by a plain selector.
const rewriteButton = page.locator(`${COVER_SELECTOR} button.rewrite-btn`).first();
if (covered && (await rewriteButton.count()) === 0) {
  failures.push('a covered post offered no rewrite control');
} else if (covered) {
  await rewriteButton.click();

  const settled = await waitFor(
    page,
    (states) => states.some((s) => s === 'rewritten' || s === 'rewrite-failed'),
    REWRITE_TIMEOUT_MS,
  );

  if (!settled) {
    failures.push('the cover never left the "rewriting" state');
  } else if (settled.includes('rewritten')) {
    const text = await page
      .locator(`${COVER_SELECTOR} .rewritten`)
      .first()
      .textContent();
    console.log(`rewritten (read it yourself): ${JSON.stringify(text)}`);
  } else {
    console.log('rewrite unavailable on this browser — checking the cover held');
    const stillCovered = (await coverStates(page)).length > 0;
    if (!stillCovered) failures.push('the cover was dropped when the rewrite failed');
  }
}

console.log(`covers=${(await coverStates(page)).join(',') || 'none'}`);
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log('  - ' + f);
} else {
  console.log('PASS');
}

await page.screenshot({ path: '.output/verify-rewrite-screenshot.png', fullPage: true }).catch(() => {});
await page.close();
await browser.close();
process.exit(failures.length > 0 ? 1 : 0);
