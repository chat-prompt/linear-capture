/**
 * Recency Boost - 최신 문서에 가중치 부여
 * 
 * 지수 감쇠 함수를 사용하여 최신 문서에 높은 점수를 부여합니다.
 * 14일 반감기: 14일 전 문서 ~50%, 28일 전 ~25%
 */

// 반감기 (일)
const HALF_LIFE_DAYS = 14;

// Recency 가중치 비율 (30% recency, 70% relevance)
const RECENCY_WEIGHT = 0.3;

/**
 * 지수 감쇠 함수로 recency 점수 계산
 * 
 * score = e^(-λt)
 * λ = ln(2) / half_life
 * 
 * @param timestamp - 문서 타임스탬프 (밀리초)
 * @returns 0~1 범위의 recency 점수
 */
export function calculateRecencyBoost(timestamp?: number): number {
  if (!timestamp) {
    return 0.5; // 타임스탬프 없으면 중간값
  }

  const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  
  // 미래 타임스탬프는 최대 점수
  if (ageInDays < 0) {
    return 1.0;
  }

  const lambda = Math.LN2 / HALF_LIFE_DAYS;
  return Math.exp(-lambda * ageInDays);
}

/**
 * 검색 결과에 Recency Boost 적용
 * 
 * 최종 점수 = (1 - RECENCY_WEIGHT) * relevance + RECENCY_WEIGHT * recency
 * 
 * @param results - score와 timestamp가 있는 결과 배열
 * @returns Recency boost가 적용된 결과 배열
 */
export function applyRecencyBoost<T extends { score: number; timestamp?: number }>(
  results: T[]
): T[] {
  return results.map(result => {
    const recencyScore = calculateRecencyBoost(result.timestamp);
    const boostedScore = (1 - RECENCY_WEIGHT) * result.score + RECENCY_WEIGHT * recencyScore;
    return { ...result, score: boostedScore };
  });
}

/**
 * Recency 점수만 계산 (디버깅/테스트용)
 */
export function getRecencyScore(timestamp?: number): {
  recencyScore: number;
  ageInDays: number;
} {
  if (!timestamp) {
    return { recencyScore: 0.5, ageInDays: -1 };
  }

  const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  const recencyScore = calculateRecencyBoost(timestamp);

  return { recencyScore, ageInDays };
}
