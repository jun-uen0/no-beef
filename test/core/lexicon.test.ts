import { describe, expect, it } from 'vitest';
import { LexiconClassifier } from '../../src/adapters/classifier/lexicon/lexicon-classifier';

const classifier = new LexiconClassifier();

async function classify(text: string) {
  return classifier.classify({ text });
}

describe('LexiconClassifier — detects blatant hostility', () => {
  it.each([
    ['死ね', 'jp-die', 'harmful'],
    ['氏ね', 'jp-die', 'harmful'],
    ['ぶっ殺すぞ', 'jp-kill', 'harmful'],
    ['消えろ', 'jp-disappear', 'harmful'],
    ['ガイジ', 'jp-slur-gaiji', 'harmful'],
    ['キチガイ', 'jp-slur-kichigai', 'harmful'],
    ['お前はカスだな', 'jp-kasu', 'harmful'],
    ['クズ扱いするな', 'jp-kuzu', 'harmful'],
    ['クソ野郎', 'jp-kuso-person', 'harmful'],
    ['きもい', 'jp-kimoi', 'mild'],
    ['うざい', 'jp-uzai', 'mild'],
    ['ブサイク', 'jp-busu', 'mild'],
    ['馬鹿だな', 'jp-baka', 'mild'],
    ['黙れ', 'jp-damare', 'mild'],
  ] as const)('flags %j as %s (%s)', async (text, reason, severity) => {
    const verdict = await classify(text);
    expect(verdict).not.toBeNull();
    expect(verdict?.severity).toBe(severity);
    expect(verdict?.reason).toBe(reason);
    expect(verdict?.source).toBe('lexicon');
    expect(verdict?.score).toBeGreaterThan(0);
  });

  it('picks the strongest verdict when multiple patterns match', async () => {
    // Contains both a mild word (うざい) and a harmful one (死ね).
    const verdict = await classify('お前うざいし死ね');
    expect(verdict?.severity).toBe('harmful');
    expect(verdict?.reason).toBe('jp-die');
  });
});

describe('LexiconClassifier — avoids false positives on lookalike substrings', () => {
  it.each([
    'カスタムしました',
    'バカンス最高',
    'アホウドリを見た',
    '普通の楽しい投稿',
  ])('does not flag %j', async (text) => {
    const verdict = await classify(text);
    expect(verdict).toBeNull();
  });

  // Regression: the second 馬鹿 in 馬鹿馬鹿しい is followed by しい, which the
  // lookahead alternation in jp-baka must reject ("ridiculous" is not an insult).
  it('does not flag 馬鹿馬鹿しい話 or 馬鹿らしい', async () => {
    expect(await classify('馬鹿馬鹿しい話')).toBeNull();
    expect(await classify('そんなの馬鹿らしいよ')).toBeNull();
  });
});
