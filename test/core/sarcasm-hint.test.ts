import { describe, expect, it } from 'vitest';
import { looksLikeSarcasm, sarcasmHint } from '../../src/core/sarcasm-hint';

/**
 * The two "gray" posts in test/fixtures/x-timeline.html. These are the posts
 * M1 lets through: polite register, no profanity, near-zero toxicity score.
 * If the gate stops firing on these, stage 3 never sees them.
 */
const SARCASM = [
  'さすがですね、そのご意見を思いつくとは頭の作りが違うんでしょうね。',
  '丁寧に説明していただいて恐縮です、次はもう少しご自分でお調べになってから聞いていただけると助かります。',
];

/** The "safe" posts from the same fixture. Firing here only wastes an LLM call, but it should still be rare. */
const SAFE = [
  '今日は雲ひとつない快晴で、洗濯物がよく乾きそう。',
  '近所に新しくできたラーメン屋、煮干し出汁が効いてて美味しかった。',
  'TypeScriptのstrictモード、最初は面倒だけど後から効いてくる。',
  '週末は自転車で川沿いを走ってきた。気持ちよかった。',
  '読みかけの小説、続きが気になって夜更かししてしまった。',
  '駅前にできたカフェ、コーヒーが安定して美味しい。',
];

describe('sarcasmHint', () => {
  it.each(SARCASM)('flags the polite sarcasm the classifier misses: %s', (text) => {
    expect(looksLikeSarcasm(text)).toBe(true);
  });

  it.each(SAFE)('leaves ordinary self-narration alone: %s', (text) => {
    expect(looksLikeSarcasm(text)).toBe(false);
  });

  it('does not fire on politeness alone', () => {
    expect(looksLikeSarcasm('ご丁寧にありがとうございます、助かりました。')).toBe(false);
    expect(looksLikeSarcasm('本日は雨のようです。傘を持っていきます。')).toBe(false);
  });

  it('needs the post to be aimed at someone, not just contain an assessment', () => {
    // No addressee and no polite register: a plain remark about a thing.
    expect(looksLikeSarcasm('この設計は立派だと思う')).toBe(false);
  });

  it('fires on condescension aimed at the reader', () => {
    expect(looksLikeSarcasm('あなたのご意見、さすがですね。')).toBe(true);
  });

  it('fires on correction dressed as politeness', () => {
    expect(looksLikeSarcasm('次はもう少し調べてから発言していただけますか。')).toBe(true);
  });

  it('fires on presumption put in the reader\'s mouth', () => {
    expect(looksLikeSarcasm('そちらではそれが常識なんでしょうね。')).toBe(true);
  });

  it('counts mockery marks only when the post is aimed at someone', () => {
    expect(looksLikeSarcasm('お前の言うことは毎回それな(笑)')).toBe(true);
    expect(looksLikeSarcasm('今日も一日がんばった(笑)')).toBe(false);
  });

  it('reports which signals matched, for debugging', () => {
    const hint = sarcasmHint(SARCASM[0] as string);
    expect(hint.suspect).toBe(true);
    expect(hint.signals).toContain('condescension');
    expect(hint.signals).toContain('presumption');
  });
});
