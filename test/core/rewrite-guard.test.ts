import { describe, expect, it } from 'vitest';
import { checkRewrite } from '../../src/core/rewrite-guard';

const ORIGINAL = 'お前みたいなカスは消えろ、二度と書き込むな。';

describe('checkRewrite', () => {
  it('accepts a rewrite that keeps the position and drops the abuse', () => {
    expect(checkRewrite(ORIGINAL, 'あなたの書き込みには賛成できません。控えていただきたいです。')).toBeNull();
  });

  it('rejects an empty answer', () => {
    expect(checkRewrite(ORIGINAL, '')).toBe('empty');
    expect(checkRewrite(ORIGINAL, '   \n ')).toBe('empty');
  });

  it('rejects the original handed back, even dressed up differently', () => {
    expect(checkRewrite(ORIGINAL, ORIGINAL)).toBe('unchanged');
    // Presented as a rewrite, a width-folded copy is still the same sentence.
    expect(checkRewrite('ＡＢＣ は最低だ', 'abc は最低だ')).toBe('unchanged');
  });

  it('rejects an answer that ran away in length', () => {
    expect(checkRewrite(ORIGINAL, 'あ'.repeat(200))).toBe('length');
  });

  it('rejects an answer short enough to be a truncation', () => {
    expect(checkRewrite(ORIGINAL, 'やめて')).toBe('length');
  });

  it('lets a very short post grow, since softening one needs the room', () => {
    // Twice "死ね" is three characters; a civil version cannot fit in that.
    expect(checkRewrite('死ね', 'もうやり取りしたくありません。')).toBeNull();
  });

  it('rejects a link, account or tag the original never mentioned', () => {
    expect(checkRewrite(ORIGINAL, '詳しくは https://example.com を見てください。')).toBe('invented-reference');
    expect(checkRewrite(ORIGINAL, '@someone さん、その書き方はやめませんか。')).toBe('invented-reference');
    expect(checkRewrite(ORIGINAL, 'その主張には賛成できません。#炎上')).toBe('invented-reference');
  });

  it('keeps references the original already had', () => {
    const withLink = 'https://example.com のこの記事を書いた奴は馬鹿だ。';
    expect(checkRewrite(withLink, 'https://example.com の記事には賛成できません。')).toBeNull();
  });
});
