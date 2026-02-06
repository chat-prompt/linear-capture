/**
 * Source-specific Recency Boost with exponential decay
 *
 * Each source has a different half-life and weight:
 * - Slack: 7-day half-life, 60% recency weight (conversations age fast)
 * - Gmail: 14-day half-life, 50% recency weight
 * - Linear: 14-day half-life, 40% recency weight (issues stay relevant longer)
 * - Notion: 30-day half-life, 20% recency weight (docs are evergreen)
 *
 * Formula: recencyScore = e^(-lambda * ageDays)  where lambda = ln(2) / halfLife
 * Final:   boostedScore = (1 - weight) * relevanceScore + weight * recencyScore
 */

export interface SourceRecencyConfig {
  halfLifeDays: number;
  weight: number; // 0-1 (recency proportion)
}

export const SOURCE_RECENCY_CONFIGS: Record<string, SourceRecencyConfig> = {
  slack: { halfLifeDays: 7, weight: 0.6 },
  linear: { halfLifeDays: 14, weight: 0.4 },
  notion: { halfLifeDays: 30, weight: 0.2 },
  gmail: { halfLifeDays: 14, weight: 0.5 },
};

const DEFAULT_CONFIG: SourceRecencyConfig = { halfLifeDays: 14, weight: 0.3 };

/**
 * Exponential decay: score = e^(-lambda * t)
 * lambda = ln(2) / half_life
 *
 * @param timestamp - Document creation time (Unix timestamp ms)
 * @param source - Source type ('slack' | 'notion' | 'linear' | 'gmail')
 * @returns 0-1 recency score
 */
export function calculateRecencyScore(
  timestamp: number | undefined,
  source: string
): number {
  if (!timestamp) return 0.5; // No timestamp → neutral

  const config = SOURCE_RECENCY_CONFIGS[source] || DEFAULT_CONFIG;
  const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  const lambda = Math.LN2 / config.halfLifeDays;

  return Math.exp(-lambda * Math.max(0, ageInDays));
}

/**
 * Apply recency boost to search results.
 * finalScore = (1 - weight) * relevanceScore + weight * recencyScore
 */
export function applyRecencyBoost<
  T extends { score: number; timestamp?: number; source: string }
>(results: T[]): T[] {
  return results.map((result) => {
    if (!result.timestamp) return result;

    const config = SOURCE_RECENCY_CONFIGS[result.source] || DEFAULT_CONFIG;
    const recencyScore = calculateRecencyScore(result.timestamp, result.source);
    const boostedScore =
      (1 - config.weight) * result.score + config.weight * recencyScore;

    return { ...result, score: boostedScore } as T;
  });
}

export function getRecencyDecayPreview(
  source: string
): Record<string, number> {
  const now = Date.now();
  const days = [0, 1, 7, 14, 30, 60, 90];

  return days.reduce(
    (acc, d) => {
      const timestamp = now - d * 24 * 60 * 60 * 1000;
      acc[`${d}d`] =
        Math.round(calculateRecencyScore(timestamp, source) * 100) / 100;
      return acc;
    },
    {} as Record<string, number>
  );
}
