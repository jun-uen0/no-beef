# Privacy Policy — no-beef

Last updated: 2026-09-15

## The short version

no-beef does not collect anything. It has no server, no account, no analytics,
and no third-party services. The text of the posts it reads never leaves your
computer.

## What the extension reads

On x.com and twitter.com, the extension reads the text of posts in the page so
it can judge whether a post is hostile, and — only when you press the button on
a cover — rewrite one into softer wording.

That text is processed entirely on your own machine, by:

- a list of patterns built into the extension,
- a machine-learning model that runs inside the extension, and
- Chrome's built-in on-device model (Gemini Nano), where your device supports it
  and you have chosen to download it.

No part of that sends the text anywhere.

## What the extension stores

Two things, both local to your browser:

- **Your settings** (whether the extension is on, which mode, the two
  thresholds), in Chrome's extension storage. If you have Chrome Sync turned
  on, Chrome syncs these settings between your own signed-in browsers, the same
  way it syncs your other Chrome settings. They contain no post text.
- **Judgements**, in the extension's own IndexedDB database, so that scrolling
  back to a post you already passed does not re-run the analysis. An entry is
  keyed by a SHA-256 hash of the post's text and holds only a severity, a score,
  and which stage decided. The text itself is not stored.

Rewritten text is never stored at all. It lives in the tab you are reading and
disappears when you close it.

You can delete everything the extension holds by removing the extension, or by
clearing its site data from `chrome://extensions`.

## What the extension downloads

Two downloads, both of models, both fetched directly by your browser:

- the toxicity classifier's weights (~136MB), from the Hugging Face CDN, the
  first time the extension analyses a post;
- Chrome's built-in Gemini Nano model, only if you press the button in the
  extension's options page. This is Chrome's own download, not ours.

These are ordinary file downloads. Nothing about you, your posts, or your
browsing is attached to them.

## What it does not do

- No telemetry, crash reporting, or usage statistics.
- No advertising, and no advertising identifiers.
- No selling or sharing of data, because none is collected.
- No reading of pages other than x.com and twitter.com.
- No writing to your account: it never posts, likes, follows, or blocks.

## Permissions, and why

| Permission | Why |
|---|---|
| `storage` | Keeps your settings and the local judgement cache. |
| `offscreen` | Runs the machine-learning model in a hidden document, because Chrome's extension service workers cannot run it directly. |
| Host access to `x.com` / `twitter.com` | Lets the extension see posts on the sites it works on. |

## Changes

If this policy ever changes, the change will appear in this file's history in
the public repository at https://github.com/jun-uen0/no-beef.

## Contact

Open an issue at https://github.com/jun-uen0/no-beef/issues.
