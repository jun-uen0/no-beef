// End-to-end check of the cover behavior against the local fixture page.
//
// Prerequisites:
//   npm run build
//   bash scripts/launch-test-chrome.sh          # Chrome with the extension, CDP :9239
//   python3 -m http.server 8787 -d test/fixtures  # fixture server (content script matches localhost)
// Run:
//   node scripts/verify-fixture.mjs
//
// Contract with the fixture (test/fixtures/x-timeline.html):
//   - each article[data-testid="tweet"] carries data-expected="harmful"|"safe"|"gray"
//   - the extension's cover host carries data-nobeef-cover="1"
// Exit code 0 = all expectations met, 1 = failures (details on stdout).
//
// Stage 3 is NOT covered here. Injecting a stand-in Prompt API into the service
// worker was tried and abandoned: Playwright's worker evaluate() runs in its own
// execution context, so the stub is visible to the test and not to the extension,
// which quietly keeps using the real API. The run then "fails" for a reason that
// has nothing to do with the code. Stage 3's wiring is covered instead by
// test/adapters/gemini-nano-classifier.test.ts, which stubs the API in-process.
//
// The gray-zone line below is the exception: run against a branded Chrome that
// has the real model (ADR 0006 explains why Chrome for Testing cannot), it does
// show what stage 3 decided. It stays informational rather than an assertion,
// because a generative model is allowed to disagree with the fixture's guess
// and 'mild' is a legitimate answer that leaves the post visible.
//
//   NOBEEF_CDP_URL=http://127.0.0.1:9240 node scripts/verify-fixture.mjs

import { chromium } from 'playwright-core';

const CDP_URL = process.env.NOBEEF_CDP_URL ?? 'http://127.0.0.1:9239';
const FIXTURE_URL = process.env.NOBEEF_FIXTURE_URL ?? 'http://localhost:8787/x-timeline.html';
// Generous: the first run may download the ONNX model (~136MB) before verdicts settle.
const SETTLE_TIMEOUT_MS = Number(process.env.NOBEEF_TIMEOUT_MS ?? 180_000);
const POLL_MS = 1000;
// How long the cover set has to stay unchanged before the run is believed.
const QUIET_MS = 8000;

function snapshot(page) {
  return page.$$eval('article[data-testid="tweet"]', (articles) =>
    articles.map((a) => ({
      expected: a.getAttribute('data-expected') ?? 'unknown',
      covered: !!a.querySelector('[data-nobeef-cover]'),
      text: (a.querySelector('[data-testid="tweetText"]')?.textContent ?? '').slice(0, 40),
    })),
  );
}

function evaluate(posts) {
  const failures = [];
  for (const p of posts) {
    if (p.expected === 'harmful' && !p.covered) failures.push(`NOT covered (harmful): ${p.text}`);
    if (p.expected === 'safe' && p.covered) failures.push(`covered (safe): ${p.text}`);
  }
  return failures;
}

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const page = await context.newPage();
await page.goto(FIXTURE_URL, { waitUntil: 'domcontentloaded' });

// Wait until the fixture finished its late insertions and recycling (~7s), then
// poll until expectations hold AND nothing has moved for QUIET_MS.
//
// Both conditions are needed. The pass/fail rule only looks at the harmful and
// safe posts, which stages 1 and 2 settle in well under a second, so stopping
// at the first clean snapshot reports a result while stage 3 is still thinking.
// That really happened: a run printed PASS with both gray-zone posts listed as
// shown, and one of them was covered seconds later. The line was not wrong
// about the assertions, but it described a state the extension had already
// left behind.
await page.waitForTimeout(8000);
const deadline = Date.now() + SETTLE_TIMEOUT_MS;
let posts = [];
let failures = ['not polled yet'];
let previous = '';
let quietSince = Date.now();
while (Date.now() < deadline) {
  posts = await snapshot(page);
  failures = evaluate(posts);
  const shape = posts.map((p) => `${p.expected}:${p.covered ? 1 : 0}`).join('|');
  if (shape !== previous) {
    previous = shape;
    quietSince = Date.now();
  } else if (failures.length === 0 && posts.length > 0 && Date.now() - quietSince >= QUIET_MS) {
    break;
  }
  await page.waitForTimeout(POLL_MS);
}

const covered = posts.filter((p) => p.covered).length;
const gray = posts.filter((p) => p.expected === 'gray');
console.log(`posts=${posts.length} covered=${covered}`);
console.log(`gray-zone posts (informational): ${gray.map((p) => `${p.covered ? 'covered' : 'shown'}:"${p.text}"`).join(' / ') || 'none'}`);
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log('  - ' + f);
} else {
  console.log('PASS');
}

await page.screenshot({ path: '.output/verify-screenshot.png', fullPage: true }).catch(() => {});
await page.close();
await browser.close();
process.exit(failures.length > 0 ? 1 : 0);
