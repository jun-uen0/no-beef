import { AnalysisPipeline } from '../src/core/pipeline';
import { LexiconClassifier } from '../src/adapters/classifier/lexicon/lexicon-classifier';
import { OffscreenClassifierProxy } from '../src/adapters/classifier/offscreen-proxy';
import { GeminiNanoClassifier } from '../src/adapters/classifier/gemini-nano/gemini-nano-classifier';
import { GeminiNanoRewriter } from '../src/adapters/rewriter/gemini-nano/gemini-nano-rewriter';
import { NativeBridgeClassifier } from '../src/adapters/bridge/native/native-bridge-classifier';
import { NativeBridgeRewriter } from '../src/adapters/bridge/native/native-bridge-rewriter';
import { loadConfig } from '../src/core/load-config';
import type { ClassifierPort, RewriterPort } from '../src/core/ports';
import { looksLikeSarcasm } from '../src/core/sarcasm-hint';
import { MemoryCache } from '../src/adapters/cache/memory-cache';
import { IndexedDbCache } from '../src/adapters/cache/indexeddb-cache';
import { LayeredCache } from '../src/adapters/cache/layered-cache';
import {
  isAnalyzeMessage,
  isRewriteMessage,
  type RewriteResponse,
} from '../src/messaging/protocol';
import { VERDICT_CACHE_NAMESPACE } from '../src/core/config';

/**
 * Minimal ambient typings for the Chrome extension APIs used across this
 * project (background, content script, offscreen document). `@types/chrome`
 * is not one of this project's dependencies and package.json must not be
 * edited to add it, so we declare only the surface we actually call.
 * Declared once here; as an ambient `declare global`, it applies to the
 * whole `tsc` program (see tsconfig.json), not just this file.
 */
declare global {
  interface NoBeefStorageArea {
    get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  }

  interface NoBeefMessageSender {
    tab?: { id?: number };
    id?: string;
  }

  type NoBeefSendResponse = (response?: unknown) => void;

  /** A native messaging port. Only the surface the bridge adapter touches. */
  interface NoBeefPort {
    postMessage(message: unknown): void;
    disconnect(): void;
    onMessage: { addListener(callback: (message: unknown) => void): void };
    onDisconnect: { addListener(callback: () => void): void };
  }

  interface NoBeefRuntime {
    sendMessage(message: unknown): Promise<unknown>;
    /** Absolute URL of a file packaged with the extension, e.g. "wasm/". */
    getURL(path: string): string;
    /** Throws synchronously when no host is registered under this name. */
    connectNative(application: string): NoBeefPort;
    onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: NoBeefMessageSender,
          sendResponse: NoBeefSendResponse,
        ) => boolean | void,
      ): void;
    };
    getContexts(filter: { contextTypes: string[] }): Promise<Array<{ contextType: string }>>;
    lastError?: { message?: string };
  }

  interface NoBeefOffscreen {
    createDocument(options: { url: string; reasons: string[]; justification: string }): Promise<void>;
  }

  const chrome: {
    storage: { sync: NoBeefStorageArea };
    runtime: NoBeefRuntime;
    offscreen: NoBeefOffscreen;
  };
}

export default defineBackground(() => {
  /**
   * Stage 3 and rewriting come from one place or the other, never both, and
   * which one is the reader's choice (ADR 0009). Resolved per call rather than
   * at startup, so flipping the setting takes effect without reloading the
   * extension — and so the native path stays untouched until somebody asks
   * for it.
   */
  const builtinClassifier = new GeminiNanoClassifier();
  const bridgeClassifier = new NativeBridgeClassifier();
  const builtinRewriter = new GeminiNanoRewriter();
  const bridgeRewriter = new NativeBridgeRewriter();

  const generativeClassifier: ClassifierPort = {
    async classify(req) {
      const { bridge } = await loadConfig();
      return bridge === 'native' ? bridgeClassifier.classify(req) : builtinClassifier.classify(req);
    },
  };

  const rewriter: RewriterPort = {
    async rewrite(req) {
      const { bridge } = await loadConfig();
      return bridge === 'native' ? bridgeRewriter.rewrite(req) : builtinRewriter.rewrite(req);
    },
  };

  const pipeline = new AnalysisPipeline({
    stages: [
      new LexiconClassifier(),
      new OffscreenClassifierProxy(),
      {
        classifier: generativeClassifier,
        // Stage 3 is orders of magnitude costlier than the two above it, so it
        // only sees posts the classifier was unsure about, plus posts that read
        // like polite condescension — which score near zero on a toxicity model
        // and would otherwise never reach it. See ADR 0004.
        shouldRun: (req, current) => current.severity === 'mild' || looksLikeSarcasm(req.text),
      },
    ],
    cache: new LayeredCache(new MemoryCache(), new IndexedDbCache(VERDICT_CACHE_NAMESPACE)),
  });

  // Rewriting is not a pipeline stage: it never runs while a feed is being
  // read, only when someone presses the control on a cover (ADR 0007).

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isAnalyzeMessage(message)) {
      pipeline
        .analyze({ text: message.text, lang: message.lang })
        .then((verdict) => sendResponse(verdict));
      return true; // keep the message channel open for the async sendResponse above
    }

    if (isRewriteMessage(message)) {
      rewriter
        .rewrite({ text: message.text, lang: message.lang })
        .then((rewritten) => sendResponse({ rewritten } satisfies RewriteResponse))
        .catch(() => sendResponse({ rewritten: null } satisfies RewriteResponse));
      return true;
    }

    // Anything else is not ours to answer — in particular MSG_CLASSIFY is
    // background -> offscreen only and is never handled here.
    return;
  });
});
