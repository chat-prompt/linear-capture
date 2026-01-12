import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

export interface AnalysisResult {
  title: string;
  description: string;
  success: boolean;
}

export class GeminiAnalyzer {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async analyzeScreenshot(imagePath: string): Promise<AnalysisResult> {
    try {
      // 이미지를 bytes로 읽기
      const imgBytes = fs.readFileSync(imagePath);
      const base64Data = imgBytes.toString('base64');

      // MIME 타입 결정
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `이 스크린샷을 분석하여 Linear 이슈용 제목과 설명을 생성하세요.

규칙:
1. 제목: 한 줄로 명확하게, 접두어 포함 (예: "[문의] 고객 요청 사항", "[버그] 로그인 오류")
2. 설명: 아래 마크다운 템플릿 형식으로 작성

설명 템플릿:
## 이슈
(스크린샷에서 파악한 핵심 문제나 요청 사항을 1-2문장으로)

## 상세 내용
(화면에서 발견한 구체적인 내용, 중요한 텍스트는 인용)

## To Do
- [ ] (필요한 조치 사항 1)
- [ ] (필요한 조치 사항 2)

반드시 JSON 형식으로만 응답 (마크다운 코드블록 없이):
{"title": "...", "description": "..."}`
              },
              {
                inlineData: {
                  mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ]
      });

      const text = response.text || '';

      // JSON 파싱 (마크다운 코드블록 제거)
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const json = JSON.parse(cleanedText);

      return {
        title: json.title || '',
        description: json.description || '',
        success: true
      };
    } catch (error) {
      console.error('Gemini analysis failed:', error);
      return {
        title: '',
        description: '',
        success: false
      };
    }
  }
}

export function createGeminiAnalyzer(): GeminiAnalyzer | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set, AI analysis disabled');
    return null;
  }
  return new GeminiAnalyzer(apiKey);
}
