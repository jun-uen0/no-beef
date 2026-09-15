# no-beef

A Chrome extension that softens hostile comments on social feeds (currently X/Twitter).
Blatant insults get covered behind a "this may be hostile" screen — similar to X's own
sensitive-content cover — and can be revealed with one click, or read as a softened
rewrite without uncovering the original.

**Privacy first: all analysis runs on your device.** Post text never leaves your machine.
There is no server, no telemetry, and no shared database.

## How it works

Analysis is a three-stage pipeline, cheapest first:

| Stage | What | Latency |
|---|---|---|
| 1 | Lexicon: regex match against a curated list of blatant insults | < 1 ms |
| 2 | On-device ML classifier (multilingual toxicity DistilBERT, int8 ONNX via transformers.js) | tens of ms |
| 3 | On-device LLM (Chrome built-in Gemini Nano via the Prompt API) for gray-zone posts and sarcasm, and for rewriting a post on request | ~seconds |

Posts are never blocked from rendering. The content script covers a post the moment it is
judged (or, in cover-first mode, the moment it appears), so the feed stays fast.

## Rewriting

A cover offers "read it softened". Pressing it — and only pressing it — asks the on-device
model to restate the post without the contempt. The rewrite appears **inside the cover**,
labelled as a rewrite, and the untouched original is always one more click away.

That labelling is the safeguard, and it is worth being plain about why. A small model can
flip a post's meaning, and no check in this codebase can tell when it has. What is checked
is the shape of the answer: empty, unchanged, wildly off in length, or naming a link or
account the post never mentioned — all of which are refused, leaving the cover as it was.
Everything past that is on the reader, which is why the original never goes away.

Stage 3 will also support **bring-your-own-agent**: if your machine cannot run Gemini Nano,
or you want higher accuracy, you will be able to plug in your own local AI agent
(e.g. Claude Code) via native messaging. The extension only provides the socket; your
agent, your rules, your cost.

## Status

Early development. M1 (Japanese-language cover-only MVP for X), M2 (on-device LLM stage
for gray-zone posts) and M3 (rewriting) are done. Next up: M4, the bring-your-own-agent
bridge.
See `docs/adr/` for design decisions and `docs/architecture.md` for the roadmap.

## Development

```bash
npm install
npm run dev        # WXT dev mode (loads into a Chromium instance)
npm test           # unit tests (vitest)
npm run build      # production build to .output/
```

To load manually: build, then `chrome://extensions` → Developer mode → "Load unpacked" →
select `.output/chrome-mv3/`.

## Architecture

Hexagonal: the analysis pipeline (`src/core/`) is pure TypeScript with no browser APIs.
Site DOM handling, the ML classifier, caching, and (later) LLM backends are adapters
behind ports, so any of them can be swapped. Details in `docs/architecture.md`.

## License

MIT. See [LICENSE](LICENSE).
