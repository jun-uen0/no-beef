// Structural probe of the REAL x.com timeline, to check the assumptions
// XSiteAdapter has only ever been tested against test/fixtures/x-timeline.html
// — a fixture written from those same assumptions, so it can only confirm them.
//
// Prerequisites:
//   npm run build
//   launch the branded Chrome on :9240 (it has the Gemini Nano weights and the
//   extension already loaded), reload the extension from chrome://extensions,
//   and LOG IN TO X BY HAND. Logged out, X serves almost no timeline and the
//   virtualised-scroll paths this exists to test never run.
// Run:
//   node scripts/probe-live.mjs
//
// PRIVACY — the one rule this script exists under:
//   A real timeline is other people's posts and real account names. Nothing
//   here may print, return, or save post text, display names, handles, or a
//   status id's actual value. Every measurement below is a COUNT or a RATIO.
//   Keep it that way: the obvious next debugging step ("just log the text that
//   failed") is exactly what must not happen, and ADR 0002 is why.
//   Screenshots are not taken at all — they would contain the timeline.
//
// Read-only: the script scrolls and reads. It never likes, posts, or follows.

import { chromium } from 'playwright-core';

const CDP_URL = process.env.NOBEEF_CDP_URL ?? 'http://127.0.0.1:9240';
const TIMELINE_URL = process.env.NOBEEF_LIVE_URL ?? 'https://x.com/home';
/** X hydrates slowly; the adapter itself waits 20s before warning. */
const SETTLE_MS = 12_000;
const SCROLL_STEPS = Number(process.env.NOBEEF_SCROLL_STEPS ?? 6);
const SCROLL_PAUSE_MS = 2_000;

/**
 * Runs inside the page. Mirrors the adapter's selectors (it cannot import
 * them) and reports only shapes and counts.
 *
 * The id comparison is the point of the whole probe. The adapter takes the
 * FIRST `/status/` link in an article. On a quote tweet or a repost, the first
 * such link can belong to the quoted post — which would key the verdict of one
 * person's words to another person's post. The timestamp link (`a > time`) is
 * the one X reliably puts on the article's own permalink, so a mismatch
 * between the two is exactly the bug, without ever revealing which post.
 */
function measure() {
  const TESTID = 'article[data-testid="tweet"]';
  const ROLE = 'article[role="article"]';

  const byTestId = document.querySelectorAll(TESTID).length;
  const byRole = document.querySelectorAll(ROLE).length;
  const articles = Array.from(document.querySelectorAll(byTestId > 0 ? TESTID : ROLE));

  const statusId = (href) => href?.match(/\/status\/(\d+)/)?.[1] ?? null;

  let withText = 0;
  let withAnyStatusLink = 0;
  let numericId = 0;
  let firstLinkVsTimeLink = 0;
  let noTimeLink = 0;
  let emptyText = 0;
  const ids = [];

  for (const article of articles) {
    if (article.querySelector('[data-testid="tweetText"]')) withText += 1;
    if ((article.textContent ?? '').trim().length === 0) emptyText += 1;

    const firstLink = article.querySelector('a[href*="/status/"]');
    const firstId = statusId(firstLink?.getAttribute('href'));
    if (firstLink) withAnyStatusLink += 1;
    if (firstId) {
      numericId += 1;
      ids.push(firstId);
    }

    const timeLink = article.querySelector('a[href*="/status/"] time')?.closest('a');
    const timeId = statusId(timeLink?.getAttribute('href'));
    if (!timeId) noTimeLink += 1;
    else if (firstId && firstId !== timeId) firstLinkVsTimeLink += 1;
  }

  // Covers: does the overlay actually sit over the post's box?
  let covers = 0;
  let coversMisplaced = 0;
  let doubleCovered = 0;
  for (const article of articles) {
    const hosts = article.querySelectorAll('[data-nobeef-cover="1"]');
    if (hosts.length === 0) continue;
    covers += 1;
    if (hosts.length > 1) doubleCovered += 1;
    const a = article.getBoundingClientRect();
    const h = hosts[0].getBoundingClientRect();
    const fits = Math.abs(a.width - h.width) < 4 && Math.abs(a.height - h.height) < 4;
    if (!fits) coversMisplaced += 1;
  }

  return {
    byTestId,
    byRole,
    articles: articles.length,
    withText,
    emptyText,
    withAnyStatusLink,
    numericId,
    uniqueIds: new Set(ids).size,
    firstLinkVsTimeLink,
    noTimeLink,
    covers,
    coversMisplaced,
    doubleCovered,
    loginWall: !!document.querySelector('[data-testid="loginButton"], [href="/i/flow/login"]'),
    onTimeline: location.pathname === '/home',
  };
}

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];

// Check the session before opening anything. Logged out, x.com/home quietly
// redirects to the marketing page, which renders no articles — a result that
// looks exactly like "the selectors are stale" and is not. Cookie NAMES are
// read here, never values.
const loggedIn = (await context.cookies('https://x.com')).some((c) => c.name === 'auth_token');
if (!loggedIn) {
  console.log('LOGIN WALL — this profile has no X session (no auth_token cookie).');
  console.log('Log in by hand in the :9240 Chrome window, then re-run. Nothing was measured.');
  await browser.close();
  process.exit(2);
}

const page = await context.newPage();

/** Only the extension's own warnings; page console noise is not ours and may quote posts. */
const warnings = new Set();
page.on('console', (msg) => {
  const text = msg.text();
  if (text.startsWith('[no-beef]')) warnings.add(text);
});

// 'commit' rather than 'domcontentloaded': x.com keeps requests in flight
// long past the point where the timeline is measurable, and the fixed wait
// below is what actually decides when to look.
await page.goto(TIMELINE_URL, { waitUntil: 'commit', timeout: 60_000 });
await page.waitForTimeout(SETTLE_MS);

let seen = await page.evaluate(measure);
if (seen.loginWall || !seen.onTimeline) {
  // The session existed but X did not serve the timeline: expired, rate
  // limited, or an interstitial. Either way nothing below would mean anything.
  console.log('NOT ON THE TIMELINE — X redirected away from /home. Session expired or interstitial.');
  await page.close();
  await browser.close();
  process.exit(2);
}

const report = (label, m) => {
  console.log(
    `${label}: articles=${m.articles} (testid=${m.byTestId} role=${m.byRole})` +
      ` withText=${m.withText} emptyText=${m.emptyText}` +
      ` statusLink=${m.withAnyStatusLink} numericId=${m.numericId} uniqueIds=${m.uniqueIds}` +
      ` idMismatch=${m.firstLinkVsTimeLink} noTimeLink=${m.noTimeLink}` +
      ` covers=${m.covers} misplaced=${m.coversMisplaced} doubled=${m.doubleCovered}`,
  );
};

report('initial ', seen);

// Scroll the way a reader would, so the virtualised recycling the adapter is
// built around actually happens.
const totals = { idMismatch: 0, misplaced: 0, doubled: 0, maxArticles: seen.articles };
for (let i = 0; i < SCROLL_STEPS; i += 1) {
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9));
  await page.waitForTimeout(SCROLL_PAUSE_MS);
  seen = await page.evaluate(measure);
  totals.idMismatch += seen.firstLinkVsTimeLink;
  totals.misplaced += seen.coversMisplaced;
  totals.doubled += seen.doubleCovered;
  totals.maxArticles = Math.max(totals.maxArticles, seen.articles);
  report(`scroll ${i + 1}`, seen);
}

console.log('---');
console.log(`extension warnings: ${warnings.size === 0 ? 'none' : [...warnings].join(' | ')}`);

const verdicts = [];
if (totals.maxArticles === 0) verdicts.push('FAIL: no posts detected at all — the article selectors are stale');
if (seen.articles > 0 && seen.withText === 0) verdicts.push('FAIL: tweetText never matched — text extraction falls back to the whole article');
if (totals.idMismatch > 0) verdicts.push(`FAIL: ${totals.idMismatch} article(s) whose first /status/ link is not their own permalink — verdicts can cross posts`);
if (totals.misplaced > 0) verdicts.push(`FAIL: ${totals.misplaced} cover(s) did not match their post's box`);
if (totals.doubled > 0) verdicts.push(`FAIL: ${totals.doubled} post(s) carried more than one cover — re-application is not idempotent`);

if (verdicts.length === 0) {
  console.log('PASS — selectors, ids and covers held on the live timeline');
} else {
  console.log('FAIL');
  for (const v of verdicts) console.log('  - ' + v);
}

await page.close();
await browser.close();
process.exit(verdicts.length > 0 ? 1 : 0);
