import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'no-beef',
    description:
      'Softens hostile comments on social feeds. All analysis runs on-device; no text ever leaves your machine.',
    permissions: ['storage', 'offscreen'],
    // wasm-unsafe-eval is the only extra CSP directive MV3 allows; needed by onnxruntime-web.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
});
