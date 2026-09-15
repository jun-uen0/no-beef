import { withTimeout } from '../../../core/timeout';
import { BRIDGE_HOST_NAME, type BridgeRequest } from './protocol';

/**
 * One request, one response, one port.
 *
 * Native messaging ports are long-lived, and reusing one would be cheaper. It
 * is not worth it: a reused port carries state between two posts, and the same
 * reasoning that made the Gemini Nano sessions throwaway clones (ADR 0005)
 * applies to a host somebody else wrote. A fresh port cannot leak yesterday's
 * request into today's answer.
 */

/** A host that never answers must not hold up the post behind it. */
const HOST_TIMEOUT_MS = 20_000;

export async function askHost(request: BridgeRequest): Promise<unknown> {
  return await withTimeout(exchange(request), HOST_TIMEOUT_MS, `native host ${request.op}`);
}

function exchange(request: BridgeRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let port: NoBeefPort;
    try {
      // Throws when no host is registered for this name, which is the normal
      // state for anyone who has not set one up.
      port = chrome.runtime.connectNative(BRIDGE_HOST_NAME);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      try {
        port.disconnect();
      } catch {
        // Already gone; nothing to release.
      }
      fn();
    };

    port.onMessage.addListener((message) => finish(() => resolve(message)));
    port.onDisconnect.addListener(() =>
      // A host that exits without answering is a failure, not an empty answer.
      finish(() => reject(new Error('native host disconnected before answering'))),
    );

    try {
      port.postMessage(request);
    } catch (err) {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    }
  });
}
