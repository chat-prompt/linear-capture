# AI 프로젝트/우선순위 추천 기능 복구

## TL;DR

> **Quick Summary**: Worker와 앱 간 끊어진 연결 3곳을 수정하여 AI 기반 프로젝트 추천 기능 복구
> 
> **Deliverables**:
> - Worker: `recentIssueTitles` 타입 추가 및 프롬프트 포함
> - App: `analysisContext`에 `recentIssueTitles` 전달
> 
> **Estimated Effort**: Quick (각 수정 1-5줄)
> **Parallel Execution**: NO - Worker 먼저 배포 후 App 수정
> **Critical Path**: Worker 타입 → Worker 프롬프트 → Worker 배포 → App IPC 수정

---

## Context

### Original Request
AI 분석 시 프로젝트/우선순위/포인트를 자동 추천하는 기능이 동작하지 않음. 이전에 구현했던 "프로젝트별 최근 이슈 10개 제목으로 적절한 프로젝트 매칭" 기능 복구 요청.

### Interview Summary
**Key Discussions**:
- 기능은 `b90f0ac` 커밋에서 추가됨 (AI 기반 메타데이터 자동 추천)
- `6004aaa` 커밋에서 로컬 캐시로 최근 이슈 제목 추가
- 인프라(Python 스크립트, 타입 정의, UI 처리)는 모두 존재
- 연결만 끊어진 상태 - 3곳 수정 필요

**Research Findings**:
- App의 `AnalysisContext` 타입에는 `recentIssueTitles` 있음
- App의 `loadLinearData()`에서 로컬 캐시 merge도 있음
- **BUT**: `ipc-handlers.ts`에서 `analysisContext` 구성 시 `recentIssueTitles` 빠짐
- **BUT**: Worker의 `PromptContext` 타입에 `recentIssueTitles` 없음
- **BUT**: Worker 프롬프트에 최근 이슈 포함 안 함

### Metis Review
**Identified Gaps** (addressed):
- Worker는 별도 프로젝트 (`/linear-capture-worker/`) - sibling 디렉토리
- 배포 순서 중요: Worker 먼저 → App 나중에
- Backward compatibility 필요: 기존 요청도 처리해야 함
- 토큰 효율: 프로젝트당 5개 정도로 제한 권장

---

## Work Objectives

### Core Objective
Worker와 App 간 `recentIssueTitles` 연결을 복구하여 AI가 프로젝트별 최근 이슈 제목을 참고하여 더 정확한 프로젝트를 추천하도록 함.

### Concrete Deliverables
- `linear-capture-worker/src/prompts/types.ts`: `recentIssueTitles` 타입 추가
- `linear-capture-worker/src/prompts/issue-prompt.ts`: 프롬프트에 최근 이슈 포함
- `linear-capture/src/main/ipc-handlers.ts`: `analysisContext`에 `recentIssueTitles` 추가

### Definition of Done
- [ ] Worker가 `recentIssueTitles` 있는/없는 요청 모두 처리
- [ ] AI 프롬프트에 최근 이슈 제목 포함 (프로젝트당 최대 5개)
- [ ] `npm run pack:clean` 후 프로젝트 추천 동작 확인

### Must Have
- 기존 요청과의 backward compatibility
- 로컬 캐시 실패 시 graceful degradation

### Must NOT Have (Guardrails)
- 이슈 description 추가 (제목만)
- 프로젝트 정렬 로직 변경
- AI 프롬프트 포맷 대폭 수정
- 10개 이상의 이슈 제목 포함 (5개로 제한)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (별도 테스트 파일 불필요)
- **User wants tests**: Manual verification
- **QA approach**: curl 테스트 + `npm run pack:clean`

### Automated Verification

**Phase 1 - Worker (curl 테스트):**
```bash
# Worker 배포 후 backward compatibility 확인 (recentIssueTitles 없이)
curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev/analyze \
  -H "Content-Type: application/json" \
  -d '{"images":[{"data":"test","mimeType":"image/png"}],"context":{"projects":[{"id":"proj-1","name":"Test Project"}]},"model":"gemini"}' \
  | jq '.success'
# Expected: true (또는 API key 에러 - 구조는 받음)

# recentIssueTitles 포함 요청
curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev/analyze \
  -H "Content-Type: application/json" \
  -d '{"images":[{"data":"test","mimeType":"image/png"}],"context":{"projects":[{"id":"proj-1","name":"Test Project","recentIssueTitles":["이슈 1","이슈 2"]}]},"model":"gemini"}' \
  | jq '.success'
# Expected: true
```

**Phase 2 - App (npm run pack:clean):**
```bash
npm run pack:clean
# 앱에서:
# 1. 캡처 실행
# 2. 분석 시작
# 3. 개발자 도구 열기 → 콘솔에서 "[LocalCache]" 로그 확인
# 4. 프로젝트 자동 선택 확인
```

---

## Execution Strategy

### Dependency Chain (Sequential)

```
Phase 1: Worker (배포 먼저)
├── Task 1: types.ts 수정
├── Task 2: issue-prompt.ts 수정
├── Task 3: TypeScript 컴파일 확인
└── Task 4: wrangler deploy

Phase 2: App (Worker 배포 후)
├── Task 5: ipc-handlers.ts 수정
├── Task 6: TypeScript 컴파일 확인
└── Task 7: npm run pack:clean 테스트
```

**Critical Path**: Task 1 → 2 → 3 → 4 → 5 → 6 → 7 (순차 실행)

---

## TODOs

### Phase 1: Worker 수정 (먼저 배포)

- [ ] 1. Worker 타입에 recentIssueTitles 추가

  **What to do**:
  - `linear-capture-worker/src/prompts/types.ts` 열기
  - `PromptContext.projects` 배열 타입에 `recentIssueTitles?: string[]` 추가

  **Must NOT do**:
  - 다른 타입 수정
  - required로 만들기 (optional 유지)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `linear-capture-worker/src/prompts/types.ts:1-6` - PromptContext 인터페이스 정의

  **Acceptance Criteria**:
  ```typescript
  // 수정 후 타입:
  export interface PromptContext {
    projects?: Array<{ 
      id: string; 
      name: string; 
      description?: string;
      recentIssueTitles?: string[];  // 이 줄 추가
    }>;
    // ...
  }
  ```
  - [ ] TypeScript 컴파일 에러 없음: `cd linear-capture-worker && npx tsc --noEmit`

  **Commit**: NO (Task 2와 함께)

---

- [ ] 2. Worker 프롬프트에 최근 이슈 포함

  **What to do**:
  - `linear-capture-worker/src/prompts/issue-prompt.ts` 열기
  - `buildContextSection()` 함수의 `projectList` 생성 부분 수정
  - 각 프로젝트에 최근 이슈 제목 최대 5개 포함

  **Must NOT do**:
  - 10개 이상 포함
  - 프롬프트 구조 대폭 변경
  - 다른 함수 수정

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `linear-capture-worker/src/prompts/issue-prompt.ts:9-27` - buildContextSection 함수
  - `linear-capture-worker/src/prompts/templates/ko.ts:68-83` - contextSection 템플릿

  **Acceptance Criteria**:
  ```typescript
  // 수정 예시:
  const projectList = context.projects
    ?.map((p) => {
      let line = `- "${p.name}" (ID: ${p.id})`;
      if (p.description) line += ` - ${p.description}`;
      if (p.recentIssueTitles?.length) {
        const titles = p.recentIssueTitles.slice(0, 5).join(', ');
        line += `\n  최근 이슈: ${titles}`;
      }
      return line;
    })
    .join('\n') || t.contextSection.noProjects;
  ```
  - [ ] TypeScript 컴파일 에러 없음

  **Commit**: YES
  - Message: `feat(prompt): include recent issue titles in AI context`
  - Files: `src/prompts/types.ts`, `src/prompts/issue-prompt.ts`
  - Pre-commit: `npx tsc --noEmit`

---

- [ ] 3. Worker 배포

  **What to do**:
  - `linear-capture-worker` 디렉토리에서 `wrangler deploy` 실행

  **Must NOT do**:
  - wrangler.toml 수정
  - 환경변수 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - `linear-capture-worker/wrangler.toml` - Worker 설정

  **Acceptance Criteria**:
  ```bash
  cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
  wrangler deploy
  # Expected: "Published linear-capture-ai"
  
  # Backward compatibility 테스트:
  curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev \
    -H "Content-Type: application/json" \
    -d '{"images":[{"data":"dGVzdA==","mimeType":"image/png"}],"model":"gemini"}' \
    | jq 'has("success")'
  # Expected: true
  ```

  **Commit**: NO (이미 커밋됨)

---

### Phase 2: App 수정 (Worker 배포 후)

- [ ] 4. App analysisContext에 recentIssueTitles 추가

  **What to do**:
  - `src/main/ipc-handlers.ts` 열기
  - 라인 227-232 부근의 `analysisContext` 구성 부분에서
  - `projects` 매핑에 `recentIssueTitles: p.recentIssueTitles` 추가

  **Must NOT do**:
  - 다른 IPC 핸들러 수정
  - 타입 정의 수정 (이미 있음)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `src/main/ipc-handlers.ts:227-237` - analysisContext 구성 부분
  - `src/services/gemini-analyzer.ts:19-25` - AnalysisContext 인터페이스 (recentIssueTitles 이미 있음)

  **Acceptance Criteria**:
  ```typescript
  // 수정 후 코드:
  const analysisContext: AnalysisContext = {
    projects: state.projectsCache.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      recentIssueTitles: p.recentIssueTitles,  // 이 줄 추가
    })),
    users: state.usersCache.map(u => ({ id: u.id, name: u.name })),
    defaultTeamId: process.env.DEFAULT_TEAM_ID,
    instruction: data.instruction,
    language: getLanguage(),
  };
  ```
  - [ ] TypeScript 컴파일 에러 없음: `npm run build`

  **Commit**: YES
  - Message: `fix(analyze): include recentIssueTitles in AI analysis context`
  - Files: `src/main/ipc-handlers.ts`
  - Pre-commit: `npm run build`

---

- [ ] 5. E2E 테스트

  **What to do**:
  - `npm run pack:clean` 실행
  - 앱에서 스크린샷 캡처 → 분석 실행
  - 개발자 도구 콘솔에서 `[LocalCache]` 로그 확인
  - 프로젝트 자동 추천 확인

  **Must NOT do**:
  - 코드 추가 수정

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`playwright`] (브라우저 테스트 필요시)

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None (최종)
  - **Blocked By**: Task 4

  **References**:
  - `CLAUDE.md` - 테스트 방법 (`npm run pack:clean`)

  **Acceptance Criteria**:
  ```bash
  npm run pack:clean
  # 앱 실행 후:
  # 1. Cmd+Shift+L로 캡처
  # 2. "분석 시작" 클릭
  # 3. View → Toggle Developer Tools
  # 4. 콘솔에서 확인:
  #    "[LocalCache] Loaded N projects from cache"
  #    "[LocalCache] Merged local cache: N projects with recent issues"
  # 5. 프로젝트 드롭다운이 자동 선택되었는지 확인
  ```

  **Commit**: NO

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 2 | `feat(prompt): include recent issue titles in AI context` | types.ts, issue-prompt.ts | `npx tsc --noEmit` |
| 4 | `fix(analyze): include recentIssueTitles in AI analysis context` | ipc-handlers.ts | `npm run build` |

---

## Success Criteria

### Verification Commands
```bash
# Worker 배포 확인
curl -s https://linear-capture-ai.ny-4f1.workers.dev | head -1
# Expected: 200 응답

# App 빌드 확인
cd linear-capture && npm run build
# Expected: 에러 없음
```

### Final Checklist
- [ ] Worker backward compatibility 유지
- [ ] TypeScript 컴파일 에러 없음 (양쪽 프로젝트)
- [ ] 프로젝트 자동 추천 동작
- [ ] 로컬 캐시 로딩 로그 표시
