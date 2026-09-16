export interface ContextTokenEstimator {
  readonly tokenizerId: string;
  estimate(text: string): number;
}

/**
 * Standard deterministic token estimator for Aurion v1.
 * Uses a word/boundary-aware heuristic calibrated for English and German world logs.
 */
export class AurionDefaultTokenEstimator implements ContextTokenEstimator {
  public readonly tokenizerId = "aurion-default-v1";

  public estimate(text: string): number {
    if (!text || text.length === 0) return 0;
    // Count whitespace/punctuation boundaries and word segments
    const words = text.trim().split(/[\s,.:;!?"'()[\]{}<>\/\\+=~`@#$%^&*|_-]+/);
    let estimate = 0;
    for (const w of words) {
      if (w.length === 0) continue;
      // Average 3.8 chars per sub-token in western languages
      estimate += Math.max(1, Math.ceil(w.length / 3.8));
    }
    // Add small overhead for punctuation / delimiters
    const punctuationMatches = text.match(/[,.:;!?"'()[\]{}<>\/\\+=~`@#$%^&*|_-]/g);
    if (punctuationMatches) {
      estimate += Math.ceil(punctuationMatches.length * 0.7);
    }
    return Math.max(1, estimate);
  }
}

export class Cl100kTokenEstimator implements ContextTokenEstimator {
  public readonly tokenizerId = "cl100k-base";

  public estimate(text: string): number {
    if (!text || text.length === 0) return 0;
    const words = text.trim().split(/\s+/);
    let count = 0;
    for (const w of words) {
      count += Math.max(1, Math.ceil(w.length / 4));
    }
    return Math.max(1, count);
  }
}

export class GeminiTokenEstimator implements ContextTokenEstimator {
  public readonly tokenizerId = "gemini-v1";

  public estimate(text: string): number {
    if (!text || text.length === 0) return 0;
    return Math.max(1, Math.ceil(text.length / 3.7));
  }
}

const REGISTRY: Record<string, ContextTokenEstimator> = {
  "aurion-default-v1": new AurionDefaultTokenEstimator(),
  "cl100k-base": new Cl100kTokenEstimator(),
  "gemini-v1": new GeminiTokenEstimator(),
};

export function getTokenEstimator(tokenizerId: string): ContextTokenEstimator {
  return REGISTRY[tokenizerId] || REGISTRY["aurion-default-v1"]!;
}

export function measureUtf8Bytes(text: string): number {
  if (!text) return 0;
  if (typeof Buffer !== "undefined") {
    return Buffer.byteLength(text, "utf-8");
  }
  return new TextEncoder().encode(text).length;
}
