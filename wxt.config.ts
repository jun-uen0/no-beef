import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'no-beef',
    description:
      'Softens hostile comments on social feeds. All analysis runs on-device; no text ever leaves your machine.',
    permissions: ['storage', 'offscreen'],
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
