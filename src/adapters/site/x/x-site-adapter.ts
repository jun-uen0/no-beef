import type { SiteAdapter } from '../../../core/ports';
import type { DetectedPost, Verdict } from '../../../core/types';
import { cover, reveal } from './cover';

/** X (formerly Twitter) renders each post in an <article>. */
const TWEET_TESTID_SELECTOR = 'article[data-testid="tweet"]';
/** Fallback selector used when X changes/strips its data-testid attributes. */
const TWEET_ROLE_SELECTOR = 'article[role="article"]';

/** X wraps the timeline in this container once the SPA has rendered it. */
const PRIMARY_COLUMN_SELECTOR = '[data-testid="primaryColumn"]';
/** Fallback container selector if the primary column testid is renamed. */
const MAIN_SELECTOR = 'main[role="main"]';

/** How long to wait before warning that no posts were ever detected. */
const NO_POSTS_WARNING_DELAY_MS = 20_000;
/** Cap on how much raw article text we fall back to when no tweetText node exists. */
const MAX_FALLBACK_TEXT_LENGTH = 2000;
/** Cap on the id we synthesize from text when no status id is found in the DOM. */
const MAX_FALLBACK_ID_LENGTH = 50;

/** Finds tweet-like article elements under `root`, preferring the testid selector. */
function queryArticles(root: ParentNode): Element[] {
  const primary = Array.from(root.querySelectorAll(TWEET_TESTID_SELECTOR));
  if (primary.length > 0) return primary;
  return Array.from(root.querySelectorAll(TWEET_ROLE_SELECTOR));
}

/** True if `el` itself (not just a descendant) is a tweet-like article. */
function matchesArticle(el: Element): boolean {
  return el.matches(TWEET_TESTID_SELECTOR) || el.matches(TWEET_ROLE_SELECTOR);
}

/**
 * Collects tweet-like articles from a MutationObserver `addedNodes` entry.
 * The added node may be the article itself, or a wrapper containing one or
 * more articles nested arbitrarily deep (X frequently inserts wrapper divs).
 */
function collectFromAddedNode(node: Node): Element[] {
  if (!(node instanceof Element)) return [];
  const found = queryArticles(node);
  if (matchesArticle(node)) return [node, ...found];
  return found;
}

/** Resolves the best-known timeline container, falling back to <body>. */
function resolveContainer(): Element {
  return (
    document.querySelector(PRIMARY_COLUMN_SELECTOR) ??
    document.querySelector(MAIN_SELECTOR) ??
    document.body
  );
}

function extractId(article: Element): string {
  const link = article.querySelector('a[href*="/status/"]');
  const href = link?.getAttribute('href') ?? '';
  const match = href.match(/\/status\/(\d+)/);
  if (match?.[1]) return match[1];

  const fallbackText = (article.textContent ?? '').trim();
  return fallbackText.slice(0, MAX_FALLBACK_ID_LENGTH);
}

function extractText(article: Element): string {
  const textEl = article.querySelector('[data-testid="tweetText"]');
  if (textEl) return (textEl.textContent ?? '').trim();
  return (article.textContent ?? '').trim().slice(0, MAX_FALLBACK_TEXT_LENGTH);
}

function extractPost(article: Element): DetectedPost {
  return { id: extractId(article), text: extractText(article) };
}

/**
 * SiteAdapter for x.com / twitter.com.
 *
 * X is a heavily virtualized SPA: the timeline container itself may not
 * exist yet at document_idle, and post nodes are recycled/re-inserted as the
 * user scrolls. We therefore observe <body> for the entire lifetime of the
 * adapter (rather than switching targets once a container appears) so we
 * never miss posts rendered before the primary column exists.
 */
export class XSiteAdapter implements SiteAdapter {
  observe(onPost: (post: DetectedPost, node: Element) => void): () => void {
    let articlesSeen = 0;
    let warned = false;

    const emit = (article: Element): void => {
      articlesSeen += 1;
      onPost(extractPost(article), article);
    };

    // Scan whatever already exists (initial page load, or a warm SPA nav).
    for (const article of queryArticles(resolveContainer())) {
      emit(article);
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          for (const article of collectFromAddedNode(added)) {
            emit(article);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const warningTimer = setTimeout(() => {
      if (articlesSeen === 0 && !warned) {
        warned = true;
        console.warn(
          '[no-beef] XSiteAdapter: no tweet articles detected after 20s; selectors may be stale.',
        );
      }
    }, NO_POSTS_WARNING_DELAY_MS);

    return () => {
      observer.disconnect();
      clearTimeout(warningTimer);
    };
  }

  cover(node: Element, verdict: Verdict, onReveal?: () => void): void {
    cover(node, verdict, onReveal);
  }

  reveal(node: Element): void {
    reveal(node);
  }
}
