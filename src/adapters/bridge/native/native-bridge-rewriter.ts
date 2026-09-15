import type { RewriterPort } from '../../../core/ports';
import { checkRewrite } from '../../../core/rewrite-guard';
import type { RewriteRequest } from '../../../core/types';
import { askHost } from './native-port';
import { parseBridgeRewrite } from './protocol';

/**
 * Rewriting, via an agent the reader runs themselves.
 *
 * The guard is deliberately the same one the on-device model's output goes
 * through. A stronger model is still a model, and the reader is still being
 * shown generated text in place of somebody's actual words — so where the
 * sentence came from changes nothing about what has to be true before it is
 * displayed (ADR 0007, ADR 0009).
 */
export class NativeBridgeRewriter implements RewriterPort {
  async rewrite(req: RewriteRequest): Promise<string | null> {
    let response: unknown;
    try {
      response = await askHost({ op: 'rewrite', text: req.text, lang: req.lang });
    } catch {
      return null;
    }

    const candidate = parseBridgeRewrite(response);
    if (!candidate) return null;
    return checkRewrite(req.text, candidate) === null ? candidate : null;
  }
}
