import * as fs from 'fs';
import * as path from 'path';

// Cloudflare Worker URL (API 키는 서버에서 관리)
const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';

export interface AnalysisResult {
  title: string;
  description: string;
  success: boolean;
  suggestedProjectId?: string;
  suggestedAssigneeId?: string;
  suggestedPriority?: number;  // 1=긴급, 2=높음, 3=중간, 4=낮음
  suggestedEstimate?: number;  // 1/2/3/5/8
  error?: string;
}

export interface AnalysisContext {
  projects: Array<{ id: string; name: string; description?: string }>;
  users: Array<{ id: string; name: string }>;
  defaultTeamId?: string;
}

export class GeminiAnalyzer {
  private maxRetries = 3;
  private baseDelay = 2000;

  constructor() {
    console.log('🤖 Gemini Analyzer (via Cloudflare Worker)');
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async analyzeScreenshot(imagePath: string, context?: AnalysisContext): Promise<AnalysisResult> {
    return this.analyzeMultipleScreenshots([imagePath], context);
  }

  async analyzeMultipleScreenshots(imagePaths: string[], context?: AnalysisContext): Promise<AnalysisResult> {
    if (imagePaths.length === 0) {
      return { title: '', description: '', success: false };
    }

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ Retry attempt ${attempt + 1} after ${delay}ms...`);
          await this.sleep(delay);
        }

        return await this.callWorker(imagePaths, context);
      } catch (error: unknown) {
        console.error(`❌ Analysis attempt ${attempt + 1} failed:`, error);

        // 마지막 시도가 아니면 재시도
        if (attempt < this.maxRetries - 1) {
          continue;
        }

        // 모든 시도 실패
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          title: '',
          description: '',
          success: false,
          error: errorMessage
        };
      }
    }

    return { title: '', description: '', success: false };
  }

  private async callWorker(imagePaths: string[], context?: AnalysisContext): Promise<AnalysisResult> {
    // 이미지들을 base64로 변환
    const images = imagePaths.map(imagePath => {
      const imgBytes = fs.readFileSync(imagePath);
      const base64Data = imgBytes.toString('base64');
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

      return { data: base64Data, mimeType };
    });

    const requestBody = {
      images,
      context: context ? {
        projects: context.projects,
        users: context.users
      } : undefined,
      model: 'gemini'
    };

    console.log(`📤 Sending ${images.length} image(s) to Worker...`);
    const startTime = Date.now();

    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const elapsed = Date.now() - startTime;
    console.log(`⏱️ Worker response in ${elapsed}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Worker error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as AnalysisResult;

    if (!result.success) {
      throw new Error(result.error || 'Analysis failed');
    }

    return result;
  }
}

export function createGeminiAnalyzer(): GeminiAnalyzer {
  // Worker 방식은 항상 사용 가능 (API 키 필요 없음)
  return new GeminiAnalyzer();
}
