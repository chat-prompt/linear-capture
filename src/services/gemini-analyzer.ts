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
  private maxRetries = 3;
  private baseDelay = 2000; // 2초

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async analyzeScreenshot(imagePath: string, context?: AnalysisContext): Promise<AnalysisResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`Retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms...`);
          await this.sleep(delay);
        }

        return await this.doAnalysis(imagePath, context);
      } catch (error: unknown) {
        lastError = error as Error;
        const err = error as { status?: number };

        // Rate limit (429) 또는 서버 에러 (5xx)면 재시도
        if (err.status === 429 || (err.status && err.status >= 500)) {
          console.warn(`API error (status: ${err.status}), will retry...`);
          continue;
        }

        // 다른 에러는 즉시 실패
        throw error;
      }
    }

    console.error('All retry attempts failed:', lastError);
    return {
      title: '',
      description: '',
      success: false
    };
  }

  private async doAnalysis(imagePath: string, context?: AnalysisContext): Promise<AnalysisResult> {
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
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `이 스크린샷을 분석하여 Linear 이슈 정보를 생성하세요.

## 제목 규칙 (매우 중요!)
형식: "[상대방회사] 구체적인 요청 내용"
길이: 40자 이내

주의사항:
- "지피터스"는 우리 회사이므로 제목에 포함하지 않음
- 상대방(고객사, 의뢰처, 문의처) 회사명을 찾아서 포함
- 회사명을 못 찾으면 담당자 이름의 소속을 추론하거나 "[외부문의]" 사용
- 요청이 여러 개면 & 로 연결

필수 포함 요소:
1. 상대방 회사명: 고객사/의뢰처 (지피터스 제외)
2. 구체적 요청: 무엇을 해달라는지 상세히
3. 마감일: 있으면 포함

좋은 예시 (40자 이내):
- "[현대차] 워크샵 커리큘럼 및 교육생 안내자료 요청 & 레드팀 활용 툴 공유"
- "[삼성] AI활용 사내교육 견적 요청 (1/20까지)"
- "[카카오] 맞춤형 워크샵 PPT 20페이지 추가 요청"

나쁜 예시:
- "[지피터스] 교육 문의" (지피터스는 우리 회사!)
- "윤누리 - 교육 내용 공유" (상대방 직원 이름이 들어가는 경우, 요청 내용 불분명)

## 설명 규칙 (불릿 포인트 필수!)
모든 내용을 불릿(-) 형식으로 작성하세요.

### 템플릿
## 요약
- (핵심 요청/문제를 한 줄로)

## 상세 내용
- (스크린샷에서 파악한 내용 1)
- (스크린샷에서 파악한 내용 2)
- (중요한 텍스트가 있으면 "인용" 형식으로)

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
