import type { Severity } from '../../../core/types';

export interface LexiconEntry {
  /** RegExp source, matched against NFKC-normalized lowercase text. */
  pattern: string;
  severity: Severity;
  /** Stable id used as Verdict.reason (never the matched text itself). */
  id: string;
}

/**
 * Stage-1 lexicon: only blatant, low-ambiguity insults belong here.
 * Ambiguous or context-dependent hostility is stage 2/3's job.
 *
 * Japanese has no word boundaries, so bare substrings false-positive easily
 * (e.g. カス matches カスタム). The (?![ァ-ヶー]) lookahead rejects matches
 * that continue as a longer katakana word.
 */
export const DEFAULT_LEXICON: LexiconEntry[] = [
  // Death wishes / direct threats — unambiguous.
  { id: 'jp-die', pattern: '死ね|氏ね|市ね|タヒね', severity: 'harmful' },
  { id: 'jp-kill', pattern: 'ぶっ?殺(す|すぞ|されろ|してやる)', severity: 'harmful' },
  { id: 'jp-disappear', pattern: '消えろ|消え失せろ|失せろ', severity: 'harmful' },
  // Slurs.
  { id: 'jp-slur-gaiji', pattern: 'ガ[イィ]ジ(?![ァ-ヶー])', severity: 'harmful' },
  { id: 'jp-slur-chisho', pattern: '池沼(?![ァ-ヶー])', severity: 'harmful' },
  { id: 'jp-slur-kichigai', pattern: 'キチガイ|きちがい|基地外|気違い', severity: 'harmful' },
  // Direct insults — strong but slightly more contextual.
  { id: 'jp-kasu', pattern: 'カス(?![ァ-ヶー])', severity: 'harmful' },
  { id: 'jp-kuzu', pattern: 'クズ(?![ァ-ヶー])', severity: 'harmful' },
  { id: 'jp-kuso-person', pattern: 'クソ(野郎|ジジイ|ババア|ガキ|リプ)', severity: 'harmful' },
  // Milder hostility — cover threshold is decided by config, not here.
  { id: 'jp-kimoi', pattern: 'きも[いすぎ]|キモ[いすぎ]|きしょい|キショい', severity: 'mild' },
  { id: 'jp-uzai', pattern: 'うざ[いすぎ]|ウザ[いすぎ]|うぜ[えぇ]', severity: 'mild' },
  { id: 'jp-busu', pattern: 'ブス(?![ァ-ヶー])|ブサイク', severity: 'mild' },
  // 馬鹿馬鹿しい/馬鹿らしい mean "ridiculous", not an insult; the lookahead must
  // also reject the second 馬鹿 of 馬鹿馬鹿しい (followed by しい), hence the alternation.
  { id: 'jp-baka', pattern: '馬鹿(?!馬鹿しい|らしい|しい)|バカ(?![ァ-ヶー])|あほ(?![ぅう])|アホ(?![ァ-ヶー])', severity: 'mild' },
  { id: 'jp-damare', pattern: '黙れ', severity: 'mild' },
];
