import { getDeviceId } from './settings-store';
import { logger } from './utils/logger';

const WORKER_URL = 'https://linear-capture-ai.kangjun-f0f.workers.dev';

interface Recommendation {
  source: string;
  title: string;
  snippet: string;
  score: number;
  url: string;
}

interface RecommendResult {
  success: boolean;
  recommendations?: Recommendation[];
  error?: string;
}

export async function getAiRecommendations(text: string, limit: number = 5): Promise<RecommendResult> {
  try {
    const deviceId = getDeviceId();
    
    const response = await fetch(`${WORKER_URL}/ai/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        device_id: deviceId,
        limit,
      }),
    });

    const data = await response.json() as RecommendResult;
    return data;
  } catch (error) {
    logger.error('AI recommend error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
