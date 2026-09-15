// Copies the ONNX Runtime WASM backend into public/ so the extension serves it
// from its own origin.
//
// Why this exists: transformers.js loads the ORT backend by dynamically
// importing it from the jsDelivr CDN. An MV3 extension page may only load
// scripts from itself ("script-src 'self' 'wasm-unsafe-eval'"), so that import
// is blocked, ORT reports "no available backend found", and the classifier
// silently never loads. There is no CSP that would allow it — remote code is
// forbidden to MV3 extensions by policy, not just by our manifest — so the
// files have to ship with the extension.
//
// They are NOT committed (21MB of wasm); this runs before every dev/build.
// Run: node scripts/copy-ort-runtime.mjs

import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(REPO, 'public', 'wasm');

/**
 * transformers.js ships the exact build it expects; onnxruntime-web is the
 * fallback for the same filenames. Taking them from the transformers package
 * first keeps the backend and the library in lockstep on upgrade.
 */
const SOURCES = [
  join(REPO, 'node_modules', '@huggingface', 'transformers', 'dist'),
  join(REPO, 'node_modules', 'onnxruntime-web', 'dist'),
];

const FILES = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];

const source = SOURCES.find((dir) => FILES.every((f) => existsSync(join(dir, f))));
if (!source) {
  console.error('ERROR: could not find the ONNX Runtime wasm backend in node_modules.');
  console.error(`  looked in: ${SOURCES.join(', ')}`);
  console.error('  run `npm install` first.');
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });
for (const file of FILES) {
  const from = join(source, file);
  const to = join(DEST, file);
  // Skip an unchanged copy so `npm run dev` does not rewrite 21MB on each restart.
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
}

console.log(`ort runtime -> public/wasm/ (${FILES.join(', ')})`);
