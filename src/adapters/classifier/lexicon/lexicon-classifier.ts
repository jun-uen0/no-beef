import type { ClassifierPort } from '../../../core/ports';
import type { AnalyzeRequest, Verdict } from '../../../core/types';
import { normalizeText } from '../../../core/normalize';
import { DEFAULT_LEXICON, type LexiconEntry } from './words';

const SCORE_BY_SEVERITY = { harmful: 0.95, mild: 0.6, safe: 0 } as const;

interface CompiledEntry {
  regex: RegExp;
  entry: LexiconEntry;
}

/** Stage 1: sub-millisecond regex lexicon for blatant insults. */
export class LexiconClassifier implements ClassifierPort {
  private readonly compiled: CompiledEntry[];

  constructor(entries: LexiconEntry[] = DEFAULT_LEXICON) {
    this.compiled = entries.map((entry) => ({
      regex: new RegExp(entry.pattern, 'u'),
      entry,
    }));
  }

  async classify(req: AnalyzeRequest): Promise<Verdict | null> {
    const text = normalizeText(req.text);
    let best: Verdict | null = null;
    for (const { regex, entry } of this.compiled) {
      if (!regex.test(text)) continue;
      const score = SCORE_BY_SEVERITY[entry.severity];
      if (!best || score > best.score) {
        best = { severity: entry.severity, score, source: 'lexicon', reason: entry.id };
      }
      if (best.severity === 'harmful') break;
    }
    return best;
  }
}
