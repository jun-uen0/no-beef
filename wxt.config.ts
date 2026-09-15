import { defineConfig } from 'wxt';

/**
 * The content script declares http://localhost/* so the fixture pages in
 * test/fixtures can be driven by a real build. A shipped extension must not
 * ask for it: it is a host permission reviewers will (rightly) question, and
 * nothing in the product needs it.
 *
 * So it is stripped from production builds and kept for development and for
 * `npm run build:test`, which is what the verify-*.mjs scripts expect.
 */
function stripLocalhostMatches(manifest: { content_scripts?: Array<{ matches?: string[] }> }): void {
  for (const script of manifest.content_scripts ?? []) {
    script.matches = script.matches?.filter((match) => !match.includes('localhost'));
  }
}

export default defineConfig({
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      const keepLocalhost = process.env.NOBEEF_ALLOW_LOCALHOST === '1' || wxt.config.mode === 'development';
      if (!keepLocalhost) stripLocalhostMatches(manifest);
    },
  },
  manifest: {
    name: 'no-beef',
    description:
      'Softens hostile comments on social feeds. All analysis runs on-device; no text ever leaves your machine.',
    // nativeMessaging is declared but unused unless the reader sets
    // bridge: 'native' in the options page; the default never opens a port.
    permissions: ['storage', 'offscreen', 'nativeMessaging'],
    // Chrome 138 is where the built-in Prompt API (Gemini Nano) went stable for
    // extensions. It needs no permission entry; the expired origin-trial one
    // ("aiLanguageModelOriginTrial") must NOT be re-added.
    minimum_chrome_version: '138',
    // wasm-unsafe-eval is the only extra CSP directive MV3 allows; needed by onnxruntime-web.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
});
