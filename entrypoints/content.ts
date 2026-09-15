import type { DetectedPost, Verdict } from '../src/core/types';
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, type NoBeefConfig } from '../src/core/config';
import {
  MSG_ANALYZE,
  MSG_REWRITE,
  type AnalyzeMessage,
  type AnalyzeResponse,
  type RewriteMessage,
  type RewriteResponse,
} from '../src/messaging/protocol';
import { XSiteAdapter } from '../src/adapters/site/x/x-site-adapter';
import { retryDelayFor } from '../src/core/undecided-retry';

/** A post is 'pending' from the moment we start analyzing it until a Verdict comes back. */
type PostState = 'pending' | Verdict;

/**
 * Used to cover a post while its analysis is in flight under cover-first
 * mode. Treated as "assume harmful until proven otherwise" (fail-safe),
 * matching cover-first's whole point.
 */
const PENDING_COVER_VERDICT: Verdict = { severity: 'harmful', score: 0, source: 'none' };

async function loadConfig(): Promise<NoBeefConfig> {
  try {
    const stored = await chrome.storage.sync.get(CONFIG_STORAGE_KEY);
    const value = stored[CONFIG_STORAGE_KEY] as Partial<NoBeefConfig> | undefined;
    return value ? { ...DEFAULT_CONFIG, ...value } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function requestAnalysis(post: DetectedPost): Promise<AnalyzeResponse> {
  const message: AnalyzeMessage = { type: MSG_ANALYZE, text: post.text };
  const response = await chrome.runtime.sendMessage(message);
  if (!response) throw new Error('no-beef: empty analyze response');
  return response as AnalyzeResponse;
}

async function requestRewrite(text: string): Promise<string | null> {
  const message: RewriteMessage = { type: MSG_REWRITE, text };
  const response = (await chrome.runtime.sendMessage(message)) as RewriteResponse | undefined;
  return response?.rewritten ?? null;
}

export default defineContentScript({
  matches: [
    '*://x.com/*',
    '*://twitter.com/*',
    // dev/testing only against local fixture HTML; remove before store submission (M5).
    'http://localhost/*',
  ],
  runAt: 'document_idle',
  async main() {
    const config = await loadConfig();
    if (!config.enabled) return;

    const adapter = new XSiteAdapter();

    // Known/decided state per post id, so recycled DOM nodes (virtual
    // scrolling) don't get re-analyzed every time they scroll back into view.
    const state = new Map<string, PostState>();
    // Ids the user explicitly chose to see; never re-covered this session.
    const revealed = new Set<string>();
    // Latest DOM node per post id: virtual scrolling can swap the node while
    // an analysis is in flight, and the verdict must land on the live one.
    const nodes = new Map<string, Element>();
    // How many times a post has come back with nobody having an opinion.
    const undecided = new Map<string, number>();

    /**
     * Rewrites already fetched in this tab, by post id. Kept here rather than
     * in the background's cache so it dies with the tab: generated text must
     * not outlive the reading session or sit next to verdicts where a later
     * reader could mistake it for the post (ADR 0007).
     */
    const rewrites = new Map<string, string>();

    function rewriteFor(id: string, text: string): Promise<string | null> {
      const cached = rewrites.get(id);
      if (cached !== undefined) return Promise.resolve(cached);
      return requestRewrite(text)
        .then((result) => {
          if (result !== null) rewrites.set(id, result);
          return result;
        })
        .catch(() => null);
    }

    /**
     * `text` is the post's own text, and passing it is what offers the rewrite
     * control. The judging-in-progress cover under cover-first mode omits it:
     * nothing has read that post yet, so there is nothing to soften.
     */
    function coverPost(node: Element, verdict: Verdict, id: string, text?: string): void {
      adapter.cover(node, verdict, {
        onReveal: () => revealed.add(id),
        ...(text === undefined ? {} : { onRewrite: () => rewriteFor(id, text) }),
      });
    }

    /**
     * A verdict nobody produced is not an answer. It mostly means the ML model
     * was still loading, which is exactly when a reader is scrolling past the
     * first screenful — so ask again shortly rather than marking the post safe
     * for the rest of the session. Bounded by retryDelayFor: where no stage can
     * ever answer, the undecided verdict is allowed to stand.
     */
    function retryIfUndecided(post: DetectedPost, node: Element, id: string, verdict: Verdict): boolean {
      if (verdict.source !== 'none') {
        undecided.delete(id);
        return false;
      }
      const attempts = undecided.get(id) ?? 0;
      const delay = retryDelayFor(attempts);
      if (delay === null) return false;

      undecided.set(id, attempts + 1);
      state.set(id, 'pending');
      setTimeout(() => {
        if (revealed.has(id)) return;
        analyze(post, nodes.get(id) ?? node, id);
      }, delay);
      return true;
    }

    function analyze(post: DetectedPost, node: Element, id: string): void {
      requestAnalysis(post)
        .then((verdict) => {
          if (retryIfUndecided(post, node, id, verdict)) return;
          state.set(id, verdict);
          if (revealed.has(id)) return; // user already opted to see this one
          const target = nodes.get(id) ?? node;
          if (verdict.severity === 'harmful') {
            coverPost(target, verdict, id, post.text);
          } else {
            adapter.reveal(target);
          }
        })
        .catch(() => {
          // sendMessage failed (e.g. background not ready) — fail open.
          state.delete(id);
          adapter.reveal(nodes.get(id) ?? node);
        });
    }

    function handlePost(post: DetectedPost, node: Element): void {
      const { id } = post;
      nodes.set(id, node);

      if (revealed.has(id)) return;

      const known = state.get(id);
      if (known && known !== 'pending') {
        if (known.severity === 'harmful') {
          coverPost(node, known, id, post.text);
        } else {
          adapter.reveal(node);
        }
        return;
      }

      if (known === 'pending') {
        if (config.mode === 'cover-first') coverPost(node, PENDING_COVER_VERDICT, id);
        return;
      }

      state.set(id, 'pending');
      if (config.mode === 'cover-first') coverPost(node, PENDING_COVER_VERDICT, id);
      analyze(post, node, id);
    }

    adapter.observe(handlePost);
  },
});
