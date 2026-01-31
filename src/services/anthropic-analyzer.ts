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
  suggestedPriority?: number;
  suggestedEstimate?: number;
  error?: string;
}

export interface AnalysisContext {
  projects: Array<{ id: string; name: string; description?: string; recentIssueTitles?: string[] }>;
  users: Array<{ id: string; name: string }>;
  defaultTeamId?: string;
  instruction?: string;
  language: string;
}

export class AnthropicAnalyzer {
  private maxRetries = 3;
  private baseDelay = 2000;

  constructor() {
    console.log('🤖 Anthropic Analyzer (via Cloudflare Worker)');
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

        if (attempt < this.maxRetries - 1) {
          continue;
        }

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
      instruction: context?.instruction,
      language: context?.language,
      model: 'haiku'  // Haiku 모델 사용
    };

    console.log(`📤 Sending ${images.length} image(s) to Worker (Haiku)...`);
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

export function createAnthropicAnalyzer(): AnthropicAnalyzer {
  // Worker 방식은 항상 사용 가능 (API 키 필요 없음)
  return new AnthropicAnalyzer();
}
