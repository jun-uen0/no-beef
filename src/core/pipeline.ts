import type { CachePort, ClassifierPort } from './ports';
import type { AnalyzeRequest, Verdict } from './types';
import { cacheKey } from './normalize';

const SAFE: Verdict = { severity: 'safe', score: 0, source: 'none' };

/**
 * A stage plus the condition under which it is worth running.
 *
 * The gate exists because stage costs differ by orders of magnitude: the
 * lexicon is free, the ONNX classifier is tens of milliseconds, and the LLM
 * is hundreds of milliseconds to seconds. Running the LLM on every post in a
 * feed is the case ADR 0001 explicitly rejected, so expensive stages declare
 * when they should run instead of running by default.
 *
 * `shouldRun` receives the request as well as the verdict accumulated so far,
 * because not every useful gate is a function of the score. Polite sarcasm is
 * the motivating example: it scores near zero on a toxicity classifier, so a
 * score-band gate would skip exactly the posts the LLM stage exists to catch.
 */
export interface PipelineStage {
  classifier: ClassifierPort;
  /** Omitted means "always run". A gate that throws is treated as false. */
  shouldRun?(req: AnalyzeRequest, current: Verdict): boolean;
}

/** A bare port is accepted as shorthand for an ungated stage. */
export type PipelineStageSpec = ClassifierPort | PipelineStage;

export interface PipelineOptions {
  /** Stages in cost order (cheapest first). */
  stages: PipelineStageSpec[];
  cache: CachePort;
}

function toStage(spec: PipelineStageSpec): PipelineStage {
  return 'classify' in spec ? { classifier: spec } : spec;
}

/**
 * Runs stages in order and keeps the strongest verdict.
 * A 'harmful' verdict is decisive and skips the remaining (costlier) stages.
 * A stage that throws or returns null is skipped — the pipeline must keep
 * working even when e.g. the ML model failed to load.
 */
export class AnalysisPipeline {
  private readonly stages: PipelineStage[];
  private readonly cache: CachePort;
  /** One line per distinct failure; a broken stage fails on every post. */
  private readonly warned = new Set<string>();

  constructor(opts: PipelineOptions) {
    this.stages = opts.stages.map(toStage);
    this.cache = opts.cache;
  }

  async analyze(req: AnalyzeRequest): Promise<Verdict> {
    const key = await cacheKey(req.text);
    const cached = await this.cache.get(key).catch(() => undefined);
    if (cached) return { ...cached, source: 'cache' };

    let result: Verdict = SAFE;
    for (const stage of this.stages) {
      if (!this.gateAllows(stage, req, result)) continue;

      let verdict: Verdict | null = null;
      try {
        verdict = await stage.classifier.classify(req);
      } catch (err) {
        // Skipping a failed stage is the point — a model that will not load
        // must not take the whole pipeline down. But swallowing the error
        // silently hides real defects (a stage wired up wrong looks exactly
        // like a model that is merely unavailable), so say something once.
        this.warnOnce(`stage ${stage.classifier.constructor.name} threw`, err);
        continue;
      }
      if (!verdict) continue;
      if (verdict.score >= result.score) result = verdict;
      if (result.severity === 'harmful') break;
    }

    // Only remember an answer somebody actually gave. A result still carrying
    // source 'none' means every stage was skipped or failed — the ML model was
    // still loading, the LLM was unavailable — and caching that freezes a
    // non-answer in place: the post is marked safe forever, and the stage that
    // was merely slow never gets a second chance at it. This is not
    // hypothetical. While stage 2 was broken, a browsing session wrote 17
    // 'none' verdicts that outlived the fix.
    if (result.source !== 'none') await this.cache.set(key, result).catch(() => {});
    return result;
  }

  /**
   * A broken gate skips its stage rather than opening it, so a bug here can
   * only cost recall — never an unbounded number of expensive LLM calls.
   */
  private gateAllows(stage: PipelineStage, req: AnalyzeRequest, current: Verdict): boolean {
    if (!stage.shouldRun) return true;
    try {
      return stage.shouldRun(req, current);
    } catch (err) {
      this.warnOnce(`gate for ${stage.classifier.constructor.name} threw`, err);
      return false;
    }
  }

  private warnOnce(message: string, err: unknown): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    console.warn(`[no-beef] ${message}:`, err);
  }
}
