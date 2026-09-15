/**
 * The rewriter's contract: what we ask, what shape we expect back, and how to
 * read the answer. Kept free of any browser API so it can be unit tested
 * without a Prompt API implementation — same split as the classifier's prompt
 * module.
 */

/**
 * Written in Japanese because the session declares ja for input and output.
 *
 * Every line here is aimed at one failure: the model deciding it knows better
 * than the author. The post's position has to survive the rewrite — a reader
 * who asked to be spared the tone did not ask to be told something else.
 */
export const SYSTEM_PROMPT = `あなたは日本語のSNS投稿を1件読み、相手を傷つける言い方だけをやわらげて書き直す。

守ること：
- 投稿者の主張・立場・評価の向きを変えない。否定していることは否定のまま書く
- 罵倒・見下し・人格への攻撃を、内容への指摘に置き換える
- 原文に無い事実・固有名詞・URL・アカウント名・ハッシュタグを足さない
- 謝罪・弁解・解説・感想を足さない
- 長さは原文と同じくらいに収める

出力は書き直した本文だけとする。前置き・見出し・注釈・引用符を付けない。`;

/**
 * Passed to prompt() as a response constraint where the runtime supports one.
 * Minimal on purpose: an unsupported schema keyword makes the whole call throw
 * NotSupportedError, and only `rewritten` is ever read.
 */
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: { rewritten: { type: 'string' } },
  required: ['rewritten'],
} as const;

export function buildUserPrompt(text: string): string {
  return `次の投稿を書き直せ。\n\n---\n${text}\n---`;
}

/** Fenced code blocks and wrapping quotes an unconstrained answer may arrive in. */
const FENCE_PATTERN = /^```[^\n]*\n([\s\S]*?)\n?```$/;
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['「', '」'],
  ['『', '』'],
];

function unwrap(text: string): string {
  const fenced = text.match(FENCE_PATTERN);
  const inner = (fenced?.[1] ?? text).trim();
  for (const [open, close] of QUOTE_PAIRS) {
    if (inner.length > 2 && inner.startsWith(open) && inner.endsWith(close)) {
      return inner.slice(open.length, -close.length).trim();
    }
  }
  return inner;
}

/**
 * Reads the rewritten text out of an answer, tolerating a runtime without
 * response constraints, which replies with bare prose instead of JSON.
 *
 * Returns null only when there is nothing to read. Anything that *is* read
 * still has to pass checkRewrite (src/core/rewrite-guard.ts) before a reader
 * sees it, so this stays permissive and the judgement happens in one place.
 */
export function parseRewrite(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0) return null;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as { rewritten?: unknown };
      if (typeof parsed.rewritten === 'string') {
        const rewritten = unwrap(parsed.rewritten);
        return rewritten.length > 0 ? rewritten : null;
      }
    } catch {
      // Not JSON after all — fall through and treat the whole answer as text.
    }
  }

  const bare = unwrap(text);
  return bare.length > 0 ? bare : null;
}
