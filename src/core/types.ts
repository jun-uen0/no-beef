/** How harsh a piece of text is judged to be. */
export type Severity = 'safe' | 'mild' | 'harmful';

/** Which stage produced the verdict. */
export type VerdictSource = 'none' | 'lexicon' | 'classifier' | 'llm' | 'cache';

export interface Verdict {
  severity: Severity;
  /** Confidence that the text is harmful, 0..1. */
  score: number;
  source: VerdictSource;
  /** Short machine-readable hint (e.g. matched lexicon pattern). Never shown raw to end users. */
  reason?: string;
}

export interface AnalyzeRequest {
  text: string;
  /** BCP-47 language hint when the site adapter knows it (e.g. "ja"). */
  lang?: string;
}

/** A request to soften one post's text. Separate from AnalyzeRequest because
 * rewriting is not a pipeline stage: it runs only when a reader asks for it. */
export interface RewriteRequest {
  text: string;
  /** BCP-47 language hint when the site adapter knows it (e.g. "ja"). */
  lang?: string;
}

/** A post detected by a site adapter in the page DOM. */
export interface DetectedPost {
  /** Stable id (e.g. tweet status id). Used to avoid re-processing recycled DOM nodes. */
  id: string;
  text: string;
}
