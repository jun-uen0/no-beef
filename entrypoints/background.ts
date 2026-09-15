import { AnalysisPipeline } from '../src/core/pipeline';
import { LexiconClassifier } from '../src/adapters/classifier/lexicon/lexicon-classifier';
import { OffscreenClassifierProxy } from '../src/adapters/classifier/offscreen-proxy';
import { MemoryCache } from '../src/adapters/cache/memory-cache';
import { IndexedDbCache } from '../src/adapters/cache/indexeddb-cache';
import { LayeredCache } from '../src/adapters/cache/layered-cache';
import { isAnalyzeMessage } from '../src/messaging/protocol';

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

  interface NoBeefRuntime {
    sendMessage(message: unknown): Promise<unknown>;
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
  const pipeline = new AnalysisPipeline({
    stages: [new LexiconClassifier(), new OffscreenClassifierProxy()],
    cache: new LayeredCache(new MemoryCache(), new IndexedDbCache()),
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Ignore anything that isn't an analyze request — in particular
    // MSG_CLASSIFY is background -> offscreen only and is never handled here.
    if (!isAnalyzeMessage(message)) return;

    pipeline
      .analyze({ text: message.text, lang: message.lang })
      .then((verdict) => sendResponse(verdict));

    return true; // keep the message channel open for the async sendResponse above
  });
});
