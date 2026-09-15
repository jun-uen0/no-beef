import type { Verdict } from '../../../core/types';

/**
 * Marker attribute on the cover host element.
 * Value is fixed at "1" (not e.g. "true") because external verification
 * scripts count covered posts by querying this exact attribute/value.
 */
const COVER_ATTR = 'data-nobeef-cover';
const COVER_ATTR_VALUE = '1';
const COVER_ATTR_SELECTOR = `[${COVER_ATTR}="${COVER_ATTR_VALUE}"]`;

const COVER_MESSAGE = '配慮が必要な可能性のある投稿です';
const REVEAL_BUTTON_LABEL = '表示する';

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
  .reveal-btn {
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
  .reveal-btn:hover {
    background: rgba(255, 255, 255, 0.18);
  }
`;

/** Ensures `node` can host an absolutely-positioned overlay that fills it. */
function ensurePositioned(node: HTMLElement): void {
  const computed = getComputedStyle(node);
  if (computed.position === 'static') {
    node.style.position = 'relative';
  }
}

/**
 * Covers `node` with a blurred, click-through-free overlay explaining that
 * the post may need consideration, plus a button to reveal it. Idempotent:
 * calling this on an already-covered node is a no-op.
 */
export function cover(node: Element, verdict: Verdict, onReveal?: () => void): void {
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

  const message = document.createElement('p');
  message.className = 'message';
  message.textContent = COVER_MESSAGE;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'reveal-btn';
  button.textContent = REVEAL_BUTTON_LABEL;
  button.addEventListener('click', () => {
    reveal(node);
    onReveal?.();
  });

  overlay.append(message, button);
  shadow.append(style, overlay);
  node.appendChild(host);
}

/** Removes the cover from `node`, if any. Safe to call on an uncovered node. */
export function reveal(node: Element): void {
  node.querySelector(COVER_ATTR_SELECTOR)?.remove();
}
