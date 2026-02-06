import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calculateRecencyScore,
  applyRecencyBoost,
  getRecencyDecayPreview,
  SOURCE_RECENCY_CONFIGS,
} from '../recency-boost';

describe('recency-boost', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateRecencyScore', () => {
    it('returns ~1.0 for current timestamp', () => {
      expect(calculateRecencyScore(Date.now(), 'slack')).toBeCloseTo(1.0, 1);
    });

    it('returns ~0.5 for Slack at 7 days', () => {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      expect(calculateRecencyScore(sevenDaysAgo, 'slack')).toBeCloseTo(0.5, 1);
    });

    it('returns ~0.5 for Notion at 30 days', () => {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      expect(calculateRecencyScore(thirtyDaysAgo, 'notion')).toBeCloseTo(
        0.5,
        1
      );
    });

    it('returns ~0.5 for Gmail at 14 days', () => {
      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      expect(calculateRecencyScore(fourteenDaysAgo, 'gmail')).toBeCloseTo(
        0.5,
        1
      );
    });

    it('returns ~0.5 for Linear at 14 days', () => {
      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      expect(calculateRecencyScore(fourteenDaysAgo, 'linear')).toBeCloseTo(
        0.5,
        1
      );
    });

    it('Slack decays faster than Notion', () => {
      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const slackScore = calculateRecencyScore(fourteenDaysAgo, 'slack');
      const notionScore = calculateRecencyScore(fourteenDaysAgo, 'notion');

      expect(slackScore).toBeLessThan(notionScore);
      expect(slackScore).toBeCloseTo(0.25, 1); // Slack 14d = ~25%
      expect(notionScore).toBeCloseTo(0.72, 1); // Notion 14d = ~72%
    });

    it('returns 0.5 for undefined timestamp', () => {
      expect(calculateRecencyScore(undefined, 'slack')).toBe(0.5);
    });

    it('uses default config for unknown source', () => {
      // Default: halfLifeDays=14, so 14 days → ~0.5
      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      expect(calculateRecencyScore(fourteenDaysAgo, 'unknown')).toBeCloseTo(
        0.5,
        1
      );
    });

    it('returns 1.0 for future timestamps (clamped at 0 age)', () => {
      const future = Date.now() + 1000 * 60 * 60 * 24;
      expect(calculateRecencyScore(future, 'slack')).toBeCloseTo(1.0, 1);
    });
  });

  describe('applyRecencyBoost', () => {
    it('applies source-specific weights for recent docs', () => {
      const now = Date.now();
      const results = [
        { id: '1', score: 0.8, timestamp: now, source: 'slack' },
        { id: '2', score: 0.8, timestamp: now, source: 'notion' },
      ];

      const boosted = applyRecencyBoost(results);

      // Slack: (1-0.6)*0.8 + 0.6*~1.0 = 0.32 + 0.6 = 0.92
      expect(boosted[0].score).toBeCloseTo(0.92, 1);
      // Notion: (1-0.2)*0.8 + 0.2*~1.0 = 0.64 + 0.2 = 0.84
      expect(boosted[1].score).toBeCloseTo(0.84, 1);
    });

    it('preserves original fields', () => {
      const results = [
        {
          id: '1',
          score: 0.8,
          timestamp: Date.now(),
          source: 'slack',
          content: 'test content',
          title: 'Test',
        },
      ];

      const boosted = applyRecencyBoost(results);
      expect(boosted[0].id).toBe('1');
      expect(boosted[0].content).toBe('test content');
      expect(boosted[0].title).toBe('Test');
      expect(boosted[0].source).toBe('slack');
    });

    it('handles empty array', () => {
      expect(applyRecencyBoost([])).toEqual([]);
    });

    it('old Slack doc gets lower boost than old Notion doc', () => {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const results = [
        { id: '1', score: 0.8, timestamp: thirtyDaysAgo, source: 'slack' },
        { id: '2', score: 0.8, timestamp: thirtyDaysAgo, source: 'notion' },
      ];

      const boosted = applyRecencyBoost(results);

      // Slack 30d: recency ~0.06, final = 0.4*0.8 + 0.6*0.06 = 0.356
      // Notion 30d: recency ~0.50, final = 0.8*0.8 + 0.2*0.50 = 0.74
      expect(boosted[0].score).toBeLessThan(boosted[1].score);
    });

    it('handles missing timestamp with neutral recency', () => {
      const results = [
        { id: '1', score: 0.8, source: 'slack' },
        { id: '2', score: 0.8, timestamp: Date.now(), source: 'slack' },
      ];

      const boosted = applyRecencyBoost(results);

      // No timestamp: recency = 0.5
      // (1-0.6)*0.8 + 0.6*0.5 = 0.32 + 0.30 = 0.62
      expect(boosted[0].score).toBeCloseTo(0.62, 1);
      // With current timestamp: recency ~1.0
      // (1-0.6)*0.8 + 0.6*1.0 = 0.32 + 0.60 = 0.92
      expect(boosted[1].score).toBeCloseTo(0.92, 1);
    });
  });

  describe('getRecencyDecayPreview', () => {
    it('returns expected decay values for Slack', () => {
      const preview = getRecencyDecayPreview('slack');
      expect(preview['0d']).toBeCloseTo(1.0, 1);
      expect(preview['7d']).toBeCloseTo(0.5, 1);
      expect(preview['14d']).toBeCloseTo(0.25, 1);
    });

    it('returns expected decay values for Notion', () => {
      const preview = getRecencyDecayPreview('notion');
      expect(preview['0d']).toBeCloseTo(1.0, 1);
      expect(preview['30d']).toBeCloseTo(0.5, 1);
    });

    it('returns all expected day keys', () => {
      const preview = getRecencyDecayPreview('slack');
      expect(Object.keys(preview)).toEqual([
        '0d',
        '1d',
        '7d',
        '14d',
        '30d',
        '60d',
        '90d',
      ]);
    });
  });

  describe('SOURCE_RECENCY_CONFIGS', () => {
    it('has configs for all expected sources', () => {
      expect(SOURCE_RECENCY_CONFIGS).toHaveProperty('slack');
      expect(SOURCE_RECENCY_CONFIGS).toHaveProperty('linear');
      expect(SOURCE_RECENCY_CONFIGS).toHaveProperty('notion');
      expect(SOURCE_RECENCY_CONFIGS).toHaveProperty('gmail');
    });

    it('all weights are between 0 and 1', () => {
      for (const config of Object.values(SOURCE_RECENCY_CONFIGS)) {
        expect(config.weight).toBeGreaterThanOrEqual(0);
        expect(config.weight).toBeLessThanOrEqual(1);
      }
    });

    it('all halfLifeDays are positive', () => {
      for (const config of Object.values(SOURCE_RECENCY_CONFIGS)) {
        expect(config.halfLifeDays).toBeGreaterThan(0);
      }
    });
  });
});
