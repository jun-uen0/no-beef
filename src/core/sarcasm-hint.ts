import { normalizeText } from './normalize';

/**
 * Cheap gate that decides whether a post is worth spending an LLM call on.
 *
 * This is NOT a verdict. Stage 1's lexicon is kept deliberately narrow because
 * a false positive there covers a post the user wanted to see. Here the cost
 * of a false positive is only one wasted on-device LLM call, and the LLM makes
 * the actual call, so this side is allowed to be generous.
 *
 * It targets the case the toxicity classifier structurally cannot catch:
 * polite-register condescension aimed at a person, which contains no profanity
 * and scores near zero on a toxicity model.
 */

/** Second person, or an honorific noun that can only refer to the other party. */
const ADDRESSEE =
  /お前|おまえ|あんた|あなた|君は|きみは|貴方|貴様|そちら|ご自分|ご自身|ご(意見|指摘|説明|理解|判断|認識|見解|発言|投稿|主張|質問|回答)|お(考え|話|返事|言葉)/;

/** Polite register. Common on its own, so it never fires without a partner signal below. */
const POLITE = /です|ます|でしょう|ござい|いただ|くださ|恐縮|幸いです|助かり/;

/** Praise or an assessment of the other party's ability, the backbone of 褒め殺し. */
const CONDESCENSION =
  /さすが|流石|なるほど|ご立派|立派|感心|賢い|お利口|頭(の作り|が(いい|良|悪))|器が(小さ|大き)|勉強になり|参考になり|すごいです|凄いです|素晴らしいです/;

/** Telling the other party how they should have behaved. */
const CORRECTION =
  /次は|今後は|もう少し|もうちょっと|少しは|くらい(は|自分)|ぐらい(は|自分)|てから(聞|言|書|質問|投稿|発言)|た方が(いい|良)|方がよろ|べきで|自分で(調べ|考え)/;

/** Putting a conclusion about the other party in their mouth. */
const PRESUMPTION = /んでしょう|のでしょう|なんですね|ということですね|みたいですね|のですね|わけですね/;

/** Explicit mockery markers. */
const MOCKERY = /\(笑\)|（笑）|草$|ｗｗ|ww/;

const SIGNALS = [
  ['addressee', ADDRESSEE],
  ['polite', POLITE],
  ['condescension', CONDESCENSION],
  ['correction', CORRECTION],
  ['presumption', PRESUMPTION],
  ['mockery', MOCKERY],
] as const;

export type SarcasmSignal = (typeof SIGNALS)[number][0];

export interface SarcasmHint {
  suspect: boolean;
  /** Which signal groups matched. For tests and debugging; never shown to users. */
  signals: SarcasmSignal[];
}

export function sarcasmHint(text: string): SarcasmHint {
  const normalized = normalizeText(text);
  const matched = new Set<SarcasmSignal>();
  for (const [name, pattern] of SIGNALS) {
    if (pattern.test(normalized)) matched.add(name);
  }

  const directed = matched.has('addressee') || matched.has('polite');
  const barb = matched.has('condescension') || matched.has('correction') || matched.has('presumption');
  // Mockery marks are noisy next to polite text (people soften with them), so
  // they only count when the post is explicitly aimed at someone.
  const suspect = (directed && barb) || (matched.has('addressee') && matched.has('mockery'));

  return { suspect, signals: [...matched] };
}

/** Convenience wrapper for use as a PipelineStage gate. */
export function looksLikeSarcasm(text: string): boolean {
  return sarcasmHint(text).suspect;
}
