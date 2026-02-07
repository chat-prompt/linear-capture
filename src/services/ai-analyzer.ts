/**
 * AiAnalyzer - Unified AI screenshot analysis via Cloudflare Worker
 *
 * Supports multiple models (haiku, gemini) through a single class.
 * Worker handles model routing and API key management.
 */

import * as fs from 'fs';
import * as path from 'path';
import { trackAnalysisFailed } from './analytics';
import { logger } from './utils/logger';
import { WORKER_BASE_URL } from './config';
import type { AnalysisResult, AnalysisContext } from '../types';

export type { AnalysisResult, AnalysisContext } from '../types';

export type AiModel = 'haiku' | 'gemini';

export class AiAnalyzer {
  private maxRetries = 3;
  private baseDelay = 2000;

  constructor(private readonly model: AiModel) {
    logger.log(`🤖 AI Analyzer [${model}] (via Cloudflare Worker)`);
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
          logger.log(`⏳ Retry attempt ${attempt + 1} after ${delay}ms...`);
          await this.sleep(delay);
        }

        return await this.callWorker(imagePaths, context);
      } catch (error: unknown) {
        logger.error(`❌ Analysis attempt ${attempt + 1} failed:`, error);

        if (attempt < this.maxRetries - 1) {
          continue;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorType = errorMessage.includes('timeout') ? 'timeout'
          : errorMessage.includes('network') ? 'network'
          : this.model;
        trackAnalysisFailed(errorType, errorMessage);
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
      model: this.model
    };

    logger.log(`📤 Sending ${images.length} image(s) to Worker [${this.model}]...`);
    const startTime = Date.now();

    const response = await fetch(WORKER_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const elapsed = Date.now() - startTime;
    logger.log(`⏱️ Worker response in ${elapsed}ms`);

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

/** Backward-compatible factory functions */
export function createAnthropicAnalyzer(): AiAnalyzer {
  return new AiAnalyzer('haiku');
}

export function createGeminiAnalyzer(): AiAnalyzer {
  return new AiAnalyzer('gemini');
}
