import type { ClassifierPort } from '../../../core/ports';
import { severityFor } from '../../../core/severity';
import type { AnalyzeRequest, Verdict } from '../../../core/types';
import { loadConfig } from '../../../core/load-config';
import { askHost } from './native-port';
import { parseBridgeVerdict } from './protocol';

/**
 * Stage 3, via an agent the reader runs themselves (ADR 0001, ADR 0009).
 *
 * Stands in the same place as GeminiNanoClassifier and behaves the same way
 * from the pipeline's side: same gate, same "null means no opinion", same
 * source on the verdict. What differs is who answers — and that the answer is
 * validated on the way in, because a host is a program the extension did not
 * write.
 */
export class NativeBridgeClassifier implements ClassifierPort {
  async classify(req: AnalyzeRequest): Promise<Verdict | null> {
    let response: unknown;
    try {
      response = await askHost({ op: 'classify', text: req.text, lang: req.lang });
    } catch {
      // No host registered, a host that died, a host that never answered.
      // All of them mean the same thing here: nothing to add.
      return null;
    }

    const parsed = parseBridgeVerdict(response);
    if (!parsed) return null;

    // The reader's thresholds apply to a bridged verdict exactly as they apply
    // to an on-device one; the host's own severity label is not authoritative
    // over the settings.
    const config = await loadConfig();
    return {
      severity: severityFor(parsed.score, config),
      score: parsed.score,
      source: 'llm',
      reason: `bridge:${parsed.severity}`,
    };
  }
}
