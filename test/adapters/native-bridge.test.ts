import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeBridgeClassifier } from '../../src/adapters/bridge/native/native-bridge-classifier';
import { NativeBridgeRewriter } from '../../src/adapters/bridge/native/native-bridge-rewriter';

const HARSH = 'お前みたいなカスは消えろ、二度と書き込むな。';

interface HostBehaviour {
  /** What the host sends back, or 'silence' to answer nothing, or 'missing' for no host at all. */
  reply?: unknown | 'silence' | 'missing' | 'disconnect';
}

function stubNativeHost({ reply = { severity: 'harmful', score: 0.9 } }: HostBehaviour = {}) {
  const calls = { connects: 0, posts: [] as unknown[], disconnects: 0 };

  const chrome = {
    storage: { sync: { get: async () => ({}) } },
    runtime: {
      connectNative() {
        calls.connects += 1;
        if (reply === 'missing') throw new Error('Specified native messaging host not found.');

        const messageListeners: Array<(m: unknown) => void> = [];
        const disconnectListeners: Array<() => void> = [];
        return {
          postMessage(message: unknown) {
            calls.posts.push(message);
            if (reply === 'silence') return;
            if (reply === 'disconnect') {
              queueMicrotask(() => disconnectListeners.forEach((fn) => fn()));
              return;
            }
            queueMicrotask(() => messageListeners.forEach((fn) => fn(reply)));
          },
          disconnect() {
            calls.disconnects += 1;
          },
          onMessage: { addListener: (fn: (m: unknown) => void) => messageListeners.push(fn) },
          onDisconnect: { addListener: (fn: () => void) => disconnectListeners.push(fn) },
        };
      },
    },
  };

  vi.stubGlobal('chrome', chrome);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('NativeBridgeClassifier', () => {
  it('turns a host verdict into one the pipeline understands', async () => {
    stubNativeHost({ reply: { severity: 'harmful', score: 0.9 } });

    const verdict = await new NativeBridgeClassifier().classify({ text: HARSH });

    expect(verdict?.source).toBe('llm');
    expect(verdict?.severity).toBe('harmful');
    expect(verdict?.reason).toBe('bridge:harmful');
  });

  it('applies the reader’s thresholds rather than the host’s own label', async () => {
    // The host says 'harmful'; the score says otherwise once the defaults are
    // applied. The settings win — a bridged verdict is not privileged.
    stubNativeHost({ reply: { severity: 'harmful', score: 0.1 } });

    expect((await new NativeBridgeClassifier().classify({ text: HARSH }))?.severity).toBe('safe');
  });

  it('has no opinion when no host is registered', async () => {
    const calls = stubNativeHost({ reply: 'missing' });

    expect(await new NativeBridgeClassifier().classify({ text: HARSH })).toBeNull();
    expect(calls.connects).toBe(1);
  });

  it('has no opinion when the host exits without answering', async () => {
    stubNativeHost({ reply: 'disconnect' });
    expect(await new NativeBridgeClassifier().classify({ text: HARSH })).toBeNull();
  });

  it('has no opinion when the host sends nonsense', async () => {
    stubNativeHost({ reply: { severity: 'harmful', score: 99 } });
    expect(await new NativeBridgeClassifier().classify({ text: HARSH })).toBeNull();
  });

  it('gives up on a host that never answers', async () => {
    vi.useFakeTimers();
    stubNativeHost({ reply: 'silence' });

    const pending = new NativeBridgeClassifier().classify({ text: HARSH });
    await vi.advanceTimersByTimeAsync(25_000);

    expect(await pending).toBeNull();
  });

  it('opens a fresh port per request and closes it', async () => {
    const calls = stubNativeHost();
    const classifier = new NativeBridgeClassifier();

    await classifier.classify({ text: HARSH });
    await classifier.classify({ text: HARSH });

    expect(calls.connects).toBe(2);
    expect(calls.disconnects).toBe(2);
  });
});

describe('NativeBridgeRewriter', () => {
  it('returns a rewrite that passes the same guard as the on-device one', async () => {
    stubNativeHost({ reply: { rewritten: 'あなたの書き込みには賛成できません。控えていただきたいです。' } });

    expect(await new NativeBridgeRewriter().rewrite({ text: HARSH })).toBe(
      'あなたの書き込みには賛成できません。控えていただきたいです。',
    );
  });

  it('withholds a rewrite that invents a link, wherever it came from', async () => {
    stubNativeHost({ reply: { rewritten: '詳しくは https://example.com をご覧ください。' } });
    expect(await new NativeBridgeRewriter().rewrite({ text: HARSH })).toBeNull();
  });

  it('withholds the original handed back as a rewrite', async () => {
    stubNativeHost({ reply: { rewritten: HARSH } });
    expect(await new NativeBridgeRewriter().rewrite({ text: HARSH })).toBeNull();
  });

  it('has no opinion when no host is registered', async () => {
    stubNativeHost({ reply: 'missing' });
    expect(await new NativeBridgeRewriter().rewrite({ text: HARSH })).toBeNull();
  });
});
