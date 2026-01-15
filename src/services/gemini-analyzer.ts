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
  private model: string;
  private maxRetries = 3;
  private baseDelay = 2000; // 2초

  constructor(apiKey: string, model?: string) {
    this.client = new GoogleGenAI({ apiKey });
    // 환경변수 또는 파라미터로 모델 지정 가능
    // 옵션: gemini-3-flash-preview (기본, 고품질), gemini-2.0-flash (빠름), gemini-2.0-flash-lite (가장 빠름)
    this.model = model || process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
    console.log(`🤖 Gemini model: ${this.model}`);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async analyzeScreenshot(imagePath: string, context?: AnalysisContext): Promise<AnalysisResult> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }

        return await this.doAnalysis(imagePath, context);
      } catch (error: unknown) {
        const err = error as { status?: number };

        // Rate limit (429) 또는 서버 에러 (5xx)면 재시도
        if (err.status === 429 || (err.status && err.status >= 500)) {
          continue;
        }

        // 다른 에러는 즉시 실패
        throw error;
      }
    }

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

      const analysisStartTime = Date.now();
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `이 스크린샷을 분석하여 Linear 이슈 정보를 생성하세요.

## 제목 규칙 (매우 중요!)

**사내 협업 vs 외부 문의 구분 규칙**:

1. **사내 협업으로 판단되는 경우** (접두어 없이 내용만):
   - 슬랙, Teams 등 사내 메신저 UI가 보이는 경우
   - "팀", "프로젝트", "회의", "공유", "검토" 등 사내 업무 용어
   - 지피터스 팀 멤버 이름이 확인되는 경우
   - 특정 외부 회사명 없이 업무 요청만 있는 경우

   형식: 구체적인 요청 내용 (40자 이내, 접두어 없음)
   예시:
   - "워크샵 커리큘럼 검토 요청"
   - "레드팀 활용 툴 정리 & 공유"
   - "교육자료 20페이지 추가 작성"
   - "PPT 수정 및 내일까지 전달"

2. **외부 클라이언트 문의인 경우** (회사명 포함):
   - 외부 회사명이 명확히 보이는 경우
   - 이메일 도메인으로 회사 식별 가능한 경우
   - "견적", "제안", "계약", "발주" 등 외부 문의 키워드

   형식: [상대방회사] 구체적인 요청 내용 (40자 이내)
   예시:
   - "[현대차] 워크샵 커리큘럼 및 교육생 안내자료 요청"
   - "[삼성] AI활용 사내교육 견적 요청 (1/20까지)"
   - "[카카오] 맞춤형 워크샵 PPT 20페이지 추가 요청"

3. **불명확한 경우**:
   - 회사명이 없고 사내/외부 구분이 어려운 경우
   - [외부문의] 대신 내용만 작성 (과도한 분류 방지)

**주의사항**:
- "지피터스"는 우리 회사이므로 제목에 절대 포함하지 않음
- 불확실할 때는 접두어 없이 요청 내용만 작성
- [외부문의]는 정말 외부 클라이언트가 명확할 때만 사용
- 요청이 여러 개면 & 로 연결
- 마감일 있으면 포함

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

      const analysisEndTime = Date.now();
      console.log(`⏱️ Gemini API call took ${analysisEndTime - analysisStartTime}ms`);

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
