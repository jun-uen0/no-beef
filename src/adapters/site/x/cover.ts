import type { CoverHandlers } from '../../../core/ports';
import type { Verdict } from '../../../core/types';

/**
 * Marker attribute on the cover host element.
 * Value is fixed at "1" (not e.g. "true") because external verification
 * scripts count covered posts by querying this exact attribute/value.
 */
const COVER_ATTR = 'data-nobeef-cover';
const COVER_ATTR_VALUE = '1';
const COVER_ATTR_SELECTOR = `[${COVER_ATTR}="${COVER_ATTR_VALUE}"]`;
/**
 * Mirrors the cover's internal state onto the host element, in the light DOM.
 * The UI itself lives in a shadow root; this attribute is what a verification
 * script can read without reaching into it.
 */
const STATE_ATTR = 'data-nobeef-state';

type CoverState = 'covered' | 'rewriting' | 'rewritten' | 'rewrite-failed';

const COVER_MESSAGE = '配慮が必要な可能性のある投稿です';
const REVEAL_BUTTON_LABEL = '表示する';
const REWRITE_BUTTON_LABEL = 'やわらかく読む';
const REWRITING_MESSAGE = '言い換えています…';
/**
 * Shown above every rewrite. The point of the whole feature is that the reader
 * gets the gist without the original's tone — which only works if they are
 * never in doubt about which of the two they are reading.
 */
const REWRITE_NOTICE = 'AIによる言い換え(原文ではありません)';
const REWRITE_FAILED_MESSAGE = '言い換えられませんでした';
const RETRY_BUTTON_LABEL = 'もう一度試す';
const SHOW_ORIGINAL_BUTTON_LABEL = '原文を表示する';

/** All styling lives inside the shadow root so it never leaks onto/from the host page. */
const SHADOW_STYLES = `
  :host {
    all: initial;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    box-sizing: border-box;
    overflow-y: auto;
    text-align: center;
    background: rgba(21, 24, 28, 0.72);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #fff;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.4;
    z-index: 1;
  }
  .message {
    margin: 0;
    max-width: 90%;
  }
  .notice {
    margin: 0;
    max-width: 90%;
    font-size: 12px;
    opacity: 0.75;
  }
  .rewritten {
    margin: 0;
    max-width: 92%;
    text-align: left;
    white-space: pre-wrap;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  button {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    font: inherit;
    font-weight: 600;
    padding: 6px 16px;
    cursor: pointer;
  }
  button:hover {
    background: rgba(255, 255, 255, 0.18);
  }
  button[disabled] {
    opacity: 0.5;
    cursor: default;
  }
`;

/** Ensures `node` can host an absolutely-positioned overlay that fills it. */
function ensurePositioned(node: HTMLElement): void {
  const computed = getComputedStyle(node);
  if (computed.position === 'static') {
    node.style.position = 'relative';
  }
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}

function paragraph(text: string, className: string): HTMLParagraphElement {
  const el = document.createElement('p');
  el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Covers `node` with a blurred, click-through-free overlay explaining that
 * the post may need consideration, plus a button to reveal it. Idempotent:
 * calling this on an already-covered node is a no-op.
 *
 * When `handlers.onRewrite` is supplied the cover also offers to soften the
 * post. The rewrite is fetched only when that button is pressed, and it is
 * shown inside the cover: the original stays underneath, never replaced, and
 * one more press reveals it (ADR 0007).
 */
export function cover(node: Element, verdict: Verdict, handlers?: CoverHandlers): void {
  if (node.querySelector(COVER_ATTR_SELECTOR)) return;
  if (!(node instanceof HTMLElement)) return;

  ensurePositioned(node);

  const host = document.createElement('div');
  host.setAttribute(COVER_ATTR, COVER_ATTR_VALUE);
  host.setAttribute('data-nobeef-severity', verdict.severity);
  Object.assign(host.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '2147483647',
  } satisfies Partial<CSSStyleDeclaration>);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = SHADOW_STYLES;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  shadow.append(style, overlay);

  let rewritten: string | null = null;

  const revealNow = (): void => {
    reveal(node);
    handlers?.onReveal?.();
  };

  const requestRewrite = (): void => {
    const onRewrite = handlers?.onRewrite;
    if (!onRewrite) return;
    render('rewriting');
    onRewrite()
      .then((text) => {
        rewritten = text;
        render(text ? 'rewritten' : 'rewrite-failed');
      })
      .catch(() => {
        rewritten = null;
        render('rewrite-failed');
      });
  };

  function render(state: CoverState): void {
    // A cover whose node was recycled out from under us has nothing to draw
    // into; bail rather than paint an overlay that is no longer on the page.
    if (!host.isConnected) return;

    host.setAttribute(STATE_ATTR, state);
    overlay.replaceChildren();
    const buttons = document.createElement('div');
    buttons.className = 'buttons';

    switch (state) {
      case 'covered':
        overlay.append(paragraph(COVER_MESSAGE, 'message'));
        buttons.append(button(REVEAL_BUTTON_LABEL, 'reveal-btn', revealNow));
        if (handlers?.onRewrite) {
          buttons.append(button(REWRITE_BUTTON_LABEL, 'rewrite-btn', requestRewrite));
        }
        break;

      case 'rewriting': {
        overlay.append(paragraph(REWRITING_MESSAGE, 'message'));
        const pending = button(REWRITE_BUTTON_LABEL, 'rewrite-btn', () => {});
        pending.disabled = true;
        buttons.append(button(REVEAL_BUTTON_LABEL, 'reveal-btn', revealNow), pending);
        break;
      }

      case 'rewritten':
        overlay.append(
          paragraph(REWRITE_NOTICE, 'notice'),
          paragraph(rewritten ?? '', 'rewritten'),
        );
        buttons.append(button(SHOW_ORIGINAL_BUTTON_LABEL, 'reveal-btn', revealNow));
        break;

      case 'rewrite-failed':
        // The cover stays. Failing to soften a post is not a reason to show it
        // to someone who has not asked to see it.
        overlay.append(paragraph(REWRITE_FAILED_MESSAGE, 'message'));
        buttons.append(
          button(REVEAL_BUTTON_LABEL, 'reveal-btn', revealNow),
          button(RETRY_BUTTON_LABEL, 'rewrite-btn', requestRewrite),
        );
        break;
    }

    overlay.append(buttons);
  }

  node.appendChild(host);
  render('covered');
}

/** Removes the cover from `node`, if any. Safe to call on an uncovered node. */
export function reveal(node: Element): void {
  node.querySelector(COVER_ATTR_SELECTOR)?.remove();
}
