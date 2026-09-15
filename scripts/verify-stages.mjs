// Asserts that each analysis stage actually answers.
//
// This exists because stage 2 was dead for an unknown length of time and
// nothing noticed. The pipeline degrades silently by design — a stage that
// cannot load is skipped — and verify-fixture.mjs only asserts on posts the
// lexicon catches on its own, so a broken classifier looked exactly like a
// classifier with nothing to say. The failure was real: transformers.js loads
// the ONNX Runtime backend from a CDN, MV3's CSP blocks remote scripts, and
// every classify() returned "no opinion" in three milliseconds.
//
// The check is therefore about PROVENANCE, not verdicts: for each stage, find
// a text only that stage can answer for, and assert the verdict says so.
//
// Prerequisites:
//   npm run build, then a Chrome with the extension loaded on CDP.
// Run:
//   node scripts/verify-stages.mjs
//   NOBEEF_CDP_URL=http://127.0.0.1:9240 node scripts/verify-stages.mjs
//
// Talks to the background directly from the extension's own options page, so
// it needs no site, no fixture server, and no network beyond the model fetch.

import { chromium } from 'playwright-core';

const CDP_URL = process.env.NOBEEF_CDP_URL ?? 'http://127.0.0.1:9239';
/** The classifier downloads ~136MB on first use; until it is warm it times out. */
const WARMUP_TIMEOUT_MS = Number(process.env.NOBEEF_WARMUP_MS ?? 240_000);
const RETRY_MS = 5_000;

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];

/** Reads the id off chrome://extensions rather than hard-coding it: unpacked ids differ per profile. */
async function findExtensionId(page) {
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  for (const item of await page.$$('extensions-item')) {
    const found = await item.evaluate((el) =>
      el.shadowRoot?.querySelector('#name')?.textContent?.trim() === 'no-beef' ? el.id : null,
    );
    if (found) return found;
  }
  return null;
}

const page = await context.newPage();
const extensionId = await findExtensionId(page);
if (!extensionId) {
  console.log('FAIL: no extension named "no-beef" is loaded in this browser');
  await page.close();
  await browser.close();
  process.exit(1);
}

await page.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(300);

/** A fresh suffix each run, so the verdict cache can never answer in a stage's place. */
const nonce = `${Date.now()}`;

const analyze = (text) =>
  page.evaluate((t) => chrome.runtime.sendMessage({ type: 'nobeef:analyze', text: t }), text);

const cases = [
  {
    stage: 'lexicon',
    // A blatant insult, which stage 1 matches by regex before anything costlier runs.
    text: `お前みたいなカスは消えろ。(${nonce})`,
    expect: 'lexicon',
    note: 'stage 1 never needs the network; if this fails the build itself is wrong',
  },
  {
    stage: 'classifier',
    // Deliberately bland: no lexicon entry matches it, so only stage 2 can have
    // an opinion. Any source other than 'classifier' means stage 2 is not running.
    text: `今日は近所の公園を散歩して、桜の写真を撮ってきました。(${nonce})`,
    expect: 'classifier',
    // The live counterpart of test/adapters/onnx-labels.test.ts. The model's
    // two labels are "not-toxic" and "toxic", and reading the wrong one made a
    // calm post score 0.99 — so a benign text coming back harmful is the
    // signature of that bug returning.
    expectNotHarmful: true,
    note: 'stage 2 loads ONNX Runtime from public/wasm/; a CDN fetch here means the CSP fix regressed',
  },
];

const failures = [];
for (const testCase of cases) {
  const deadline = Date.now() + (testCase.expect === 'classifier' ? WARMUP_TIMEOUT_MS : 15_000);
  let verdict = null;
  while (Date.now() < deadline) {
    verdict = await analyze(testCase.text);
    if (verdict?.source === testCase.expect) break;
    // The model may still be downloading; ask again with a text it has not seen.
    await page.waitForTimeout(RETRY_MS);
    testCase.text = `${testCase.text}。`;
  }

  const got = verdict?.source ?? 'no response';
  console.log(`${testCase.stage}: source=${got} severity=${verdict?.severity} score=${verdict?.score}`);
  if (got !== testCase.expect) {
    failures.push(`${testCase.stage}: expected source="${testCase.expect}", got "${got}" — ${testCase.note}`);
  }
  if (testCase.expectNotHarmful && verdict?.severity === 'harmful') {
    failures.push(
      `${testCase.stage}: a deliberately bland sentence was judged harmful (score ${verdict.score}) —` +
        ' the toxic label is being read off the wrong class',
    );
  }
}

if (failures.length === 0) {
  console.log('PASS — every stage answered for the text only it could answer for');
} else {
  console.log('FAIL');
  for (const f of failures) console.log('  - ' + f);
}

await page.close();
await browser.close();
process.exit(failures.length > 0 ? 1 : 0);
