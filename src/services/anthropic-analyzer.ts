import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

export interface AnalysisResult {
  title: string;
  description: string;
  success: boolean;
  suggestedProjectId?: string;
  suggestedAssigneeId?: string;
  suggestedPriority?: number;
  suggestedEstimate?: number;
}

export interface AnalysisContext {
  projects: Array<{ id: string; name: string; description?: string }>;
  users: Array<{ id: string; name: string }>;
  defaultTeamId?: string;
}

export class AnthropicAnalyzer {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model || 'claude-haiku-4-5-20251001';
    console.log(`🤖 Anthropic model: ${this.model}`);
  }

  async analyzeScreenshot(imagePath: string, context?: AnalysisContext): Promise<AnalysisResult> {
    try {
      return await this.doAnalysis(imagePath, context);
    } catch (error: unknown) {
      console.error('Anthropic analysis error:', error);
      return {
        title: '',
        description: '',
        success: false
      };
    }
  }

  private async doAnalysis(imagePath: string, context?: AnalysisContext): Promise<AnalysisResult> {
    const imgBytes = fs.readFileSync(imagePath);
    const base64Data = imgBytes.toString('base64');

    const ext = path.extname(imagePath).toLowerCase();
    const mediaType = ext === '.png' ? 'image/png' : 'image/jpeg';

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

    const prompt = `이 스크린샷을 분석하여 Linear 이슈 정보를 생성하세요.

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
${jsonFormat}`;

    const analysisStartTime = Date.now();

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const analysisEndTime = Date.now();
    console.log(`⏱️ Anthropic API call took ${analysisEndTime - analysisStartTime}ms`);

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

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

export function createAnthropicAnalyzer(): AnthropicAnalyzer | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set');
    return null;
  }
  return new AnthropicAnalyzer(apiKey);
}
