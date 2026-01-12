import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

export interface AnalysisResult {
  title: string;
  description: string;
  success: boolean;
  suggestedProjectId?: string;
  suggestedAssigneeId?: string;
  suggestedPriority?: number;  // 1=긴급, 2=높음, 3=중간, 4=낮음
  suggestedEstimate?: number;  // 1/2/3/5/8
}

export interface AnalysisContext {
  projects: Array<{ id: string; name: string; description?: string }>;
  users: Array<{ id: string; name: string }>;
  defaultTeamId?: string;
}

export class GeminiAnalyzer {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async analyzeScreenshot(imagePath: string, context?: AnalysisContext): Promise<AnalysisResult> {
    try {
      // 이미지를 bytes로 읽기
      const imgBytes = fs.readFileSync(imagePath);
      const base64Data = imgBytes.toString('base64');

      // MIME 타입 결정
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

      // 컨텍스트 기반 프롬프트 생성
      const contextSection = context ? `

## 추가 분석
스크린샷 내용을 기반으로 가장 적합한 값을 선택하세요.

### 사용 가능한 프로젝트
${context.projects.map(p => `- "${p.name}" (ID: ${p.id})${p.description ? ` - ${p.description}` : ''}`).join('\n')}

### 사용 가능한 담당자
${context.users.map(u => `- "${u.name}" (ID: ${u.id})`).join('\n')}

### 우선순위 기준
- 1 (긴급): 에러, 장애, 긴급 요청
- 2 (높음): 중요한 버그, 빠른 처리 필요
- 3 (중간): 일반 요청, 개선사항 (기본값)
- 4 (낮음): 사소한 개선, 나중에 해도 됨

### 포인트 기준 (작업량 추정)
- 1: 아주 작음 (설정 변경, 텍스트 수정)
- 2: 작음 (간단한 버그 수정)
- 3: 중간 (기능 수정)
- 5: 큼 (새 기능 개발)
- 8: 매우 큼 (대규모 작업)` : '';

      const jsonFormat = context
        ? `{
  "title": "제목",
  "description": "설명 (마크다운)",
  "projectId": "매칭되는 프로젝트 ID 또는 null",
  "assigneeId": "매칭되는 담당자 ID 또는 null",
  "priority": 3,
  "estimate": 2
}`
        : `{"title": "...", "description": "..."}`;

      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `이 스크린샷을 분석하여 Linear 이슈 정보를 생성하세요.

## 규칙
1. 제목: 한 줄로 명확하게, 접두어 포함 (예: "[문의] 고객 요청", "[버그] 로그인 오류")
2. 설명: 아래 마크다운 템플릿 형식으로 작성

## 설명 템플릿
## 이슈
(스크린샷에서 파악한 핵심 문제나 요청 사항을 1-2문장으로)

## 상세 내용
(화면에서 발견한 구체적인 내용, 중요한 텍스트는 인용)

## To Do
- [ ] (필요한 조치 사항 1)
- [ ] (필요한 조치 사항 2)
${contextSection}

## JSON 응답 형식 (마크다운 코드블록 없이):
${jsonFormat}`
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
        success: true,
        suggestedProjectId: json.projectId || undefined,
        suggestedAssigneeId: json.assigneeId || undefined,
        suggestedPriority: json.priority || undefined,
        suggestedEstimate: json.estimate || undefined,
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
