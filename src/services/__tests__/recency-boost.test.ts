import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateRecencyBoost, applyRecencyBoost, getRecencyScore } from '../recency-boost';

describe('recency-boost', () => {
  const REAL_NOW = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(REAL_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateRecencyBoost', () => {
    it('returns 0.5 for undefined timestamp', () => {
      expect(calculateRecencyBoost(undefined)).toBe(0.5);
    });

    it('returns ~1.0 for current timestamp', () => {
      const score = calculateRecencyBoost(REAL_NOW);
      expect(score).toBeCloseTo(1.0, 2);
    });

    it('returns ~0.5 for 14-day-old document (half-life)', () => {
      const fourteenDaysAgo = REAL_NOW - (14 * DAY_MS);
      const score = calculateRecencyBoost(fourteenDaysAgo);
      expect(score).toBeCloseTo(0.5, 1);
    });

    it('returns ~0.25 for 28-day-old document (2x half-life)', () => {
      const twentyEightDaysAgo = REAL_NOW - (28 * DAY_MS);
      const score = calculateRecencyBoost(twentyEightDaysAgo);
      expect(score).toBeCloseTo(0.25, 1);
    });

    it('returns 1.0 for future timestamp', () => {
      const future = REAL_NOW + DAY_MS;
      const score = calculateRecencyBoost(future);
      expect(score).toBe(1.0);
    });

    it('decays exponentially over time', () => {
      const scores = [0, 7, 14, 21, 28].map(days => 
        calculateRecencyBoost(REAL_NOW - (days * DAY_MS))
      );
      
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThan(scores[i - 1]);
      }
    });
  });

  describe('applyRecencyBoost', () => {
    it('boosts recent documents', () => {
      const results = [
        { id: '1', score: 0.8, timestamp: REAL_NOW },
        { id: '2', score: 0.8, timestamp: REAL_NOW - (14 * DAY_MS) },
      ];

      const boosted = applyRecencyBoost(results);

      expect(boosted[0].score).toBeGreaterThan(boosted[1].score);
    });

    it('preserves original properties', () => {
      const results = [
        { id: 'test', score: 0.9, timestamp: REAL_NOW, extra: 'data' },
      ];

      const boosted = applyRecencyBoost(results);

      expect(boosted[0].id).toBe('test');
      expect(boosted[0].extra).toBe('data');
    });

    it('applies 30% recency weight', () => {
      const results = [
        { id: '1', score: 1.0, timestamp: REAL_NOW },
      ];

      const boosted = applyRecencyBoost(results);
      // 0.7 * 1.0 + 0.3 * 1.0 = 1.0
      expect(boosted[0].score).toBeCloseTo(1.0, 2);
    });

    it('handles missing timestamp with middle score', () => {
      const results = [
        { id: '1', score: 1.0 },
      ];

      const boosted = applyRecencyBoost(results);
      // 0.7 * 1.0 + 0.3 * 0.5 = 0.85
      expect(boosted[0].score).toBeCloseTo(0.85, 2);
    });
  });

  describe('getRecencyScore', () => {
    it('returns ageInDays -1 for undefined timestamp', () => {
      const result = getRecencyScore(undefined);
      expect(result.ageInDays).toBe(-1);
      expect(result.recencyScore).toBe(0.5);
    });

    it('returns correct age in days', () => {
      const sevenDaysAgo = REAL_NOW - (7 * DAY_MS);
      const result = getRecencyScore(sevenDaysAgo);
      expect(result.ageInDays).toBeCloseTo(7, 0);
    });
  });
});
