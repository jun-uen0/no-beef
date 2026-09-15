import type { NoBeefConfig } from '../../../core/config';
import type { Verdict } from '../../../core/types';

/**
 * The Gemini Nano stage's contract: what we ask, what shape we expect back,
 * and how that maps onto a Verdict. Kept free of any browser API so it can be
 * unit tested without a Prompt API implementation.
 */

export const SEVERITY_LABELS = ['safe', 'mild', 'harmful'] as const;
export type SeverityLabel = (typeof SEVERITY_LABELS)[number];

/**
 * Written in Japanese because the session declares ja for input and output.
 * The safe/harmful split is spelled out explicitly: this stage exists to catch
 * politely worded contempt, and the failure mode to avoid is treating ordinary
 * disagreement as an attack.
 */
export const SYSTEM_PROMPT = `あなたは日本語のSNS投稿を1件読み、それが特定の相手を傷つける内容かどうかを判定する。

罵倒語の有無で判定してはいけない。丁寧な言葉づかいのまま相手を見下す表現を見抜くことが目的である。

harmful と判定するもの：
- 褒め殺し、当てこすり
- 相手の能力・知性・人格を暗に貶める言い回し
- 助言や指導の体裁をとった侮辱

safe と判定するもの：
- 出来事や物事についての感想で、特定の相手に向いていないもの
- 批判や意見の相違であっても、相手の人格ではなく内容に向いているもの

mild と判定するもの：
- とげはあるが、相手を傷つける意図が明確とは言えないもの

判定結果だけを出力する。理由・前置き・言い換えを書かない。`;

/**
 * Passed to prompt() as a response constraint where the runtime supports one.
 * Deliberately minimal: an unsupported schema keyword makes the whole call
 * throw NotSupportedError, and only `severity` is ever read.
 */
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: { severity: { type: 'string', enum: [...SEVERITY_LABELS] } },
  required: ['severity'],
} as const;

export function buildUserPrompt(text: string): string {
  return `次の投稿を判定せよ。\n\n---\n${text}\n---`;
}

/**
 * Representative harmfulness for each label. The model answers categorically,
 * but Verdict.score means "confidence that the text is harmful", and the
 * pipeline compares stages by that score — so a 'safe' answer must not carry a
 * high number or it would overwrite a harsher verdict from an earlier stage.
 *
 * The score then goes back through the user's thresholds, so raising
 * harmfulThreshold still demotes this stage's answers the same way it demotes
 * the classifier's.
 */
const LABEL_SCORE: Record<SeverityLabel, number> = {
  safe: 0.05,
  mild: 0.65,
  harmful: 0.95,
};

function severityFor(score: number, config: NoBeefConfig): Verdict['severity'] {
  if (score >= config.harmfulThreshold) return 'harmful';
  if (score >= config.mildThreshold) return 'mild';
  return 'safe';
}

export function toVerdict(label: SeverityLabel, config: NoBeefConfig): Verdict {
  const score = LABEL_SCORE[label];
  return { severity: severityFor(score, config), score, source: 'llm', reason: `llm:${label}` };
}

function isLabel(value: unknown): value is SeverityLabel {
  return typeof value === 'string' && (SEVERITY_LABELS as readonly string[]).includes(value);
}

/**
 * Tolerant of a runtime without response constraints, which answers with prose
 * instead of JSON. Returns null ("no opinion") rather than guessing, since the
 * pipeline degrades gracefully but a wrong label would cover a post.
 */
export function parseLabel(raw: string): SeverityLabel | null {
  const text = raw.trim();

  const json = text.startsWith('{') ? text : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (json.startsWith('{')) {
    try {
      const parsed = JSON.parse(json) as { severity?: unknown };
      if (isLabel(parsed.severity)) return parsed.severity;
    } catch {
      // fall through to the bare-word path
    }
  }

  // Only trust a bare word from a short answer that names exactly one label:
  // in a longer sentence the first match is as likely to be a negation
  // ("harmful ではない") as an answer.
  if (text.length > 40) return null;
  const found = new Set(SEVERITY_LABELS.filter((label) => text.toLowerCase().includes(label)));
  return found.size === 1 ? ([...found][0] ?? null) : null;
}
