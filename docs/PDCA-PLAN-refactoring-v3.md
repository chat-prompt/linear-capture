# Linear Capture - PDCA 리팩토링 계획서 v3

> **작성일**: 2026-02-07
> **대상**: Linear Capture v1.2.10 (Electron + TypeScript)
> **방법론**: PDCA (Plan-Do-Check-Act) + Claude Code 에이전트 팀 병렬 실행
> **범위**: 크리티컬 3개 Phase (전체 7개 중 선별)

---

## 1. 실행 전략

### 1.1 왜 직렬인가? (Git Worktree 병렬 불가 판단)

```
Phase 1 (타입) ──▶ Phase 2 (서비스) ──▶ Phase 3 (IPC 분할)
    │                    │                    │
    └── src/types/ 생성  └── types import    └── types import
                         └── import 경로 변경  └── ipc-handlers.ts 분할
```

**Worktree 병렬이 불가한 이유**:
- Phase 1이 `src/types/`를 생성 → Phase 2, 3이 전부 import
- Phase 2가 `embedding-service.ts` 삭제 → Phase 3의 서비스 참조 영향
- **같은 파일을 동시에 건드림** → merge conflict 지옥

**결론**: Phase 간은 **직렬**, Phase 내에서 **에이전트 병렬** 실행

### 1.2 에이전트 팀 구성 (Phase 내 병렬)

| 역할 | Claude Code Agent | 핵심 책임 |
|------|-------------------|----------|
| **Data Architect** | Agent A | 타입 정의, 스키마 설계 |
| **Backend Lead** | Agent B | 서비스 코드, IPC 핸들러 |
| **QA Validator** | Agent C | 타입 체크, 테스트, 검증 |

### 1.3 선별 기준: 왜 이 3개인가?

| Phase | 해결 문제 | 위험도 | 효과 | 소요 |
|:-----:|----------|:------:|------|:----:|
| **1. 타입 기반** | H1(IPC 타입 없음), H4(타입 중복) | 낮음 | 이후 모든 리팩토링의 안전망 | 1-2일 |
| **2. 서비스 정리** | M2(임베딩 중복), M3(필터 중복), L1(매직넘버) | 낮음 | 퀵윈, 즉각적 코드 품질 개선 | 0.5일 |
| **3. IPC 분할** | H2(857줄 갓파일), H3(AppState 갓오브젝트), M1(OAuth 중복) | 중간 | 유지보수성 대폭 개선 | 2일 |

**후순위로 미룬 Phase** (별도 스프린트):

| Phase | 이유 |
|-------|------|
| Electron 보안 (Preload 전환) | 모든 IPC 호출 + 렌더러 전체 수정 필요, 범위가 너무 큼 |
| 렌더러 모듈화 | index.html 2,600줄 인라인 JS 분리는 Preload 전환 이후에 해야 의미 있음 |
| 테스트 구축 | Phase 1-3 완료 후 안정화된 구조 위에서 작성해야 효율적 |

---

## 2. 서비스 정의서 - Linear Capture란?

### 2.1 서비스 개요

**Linear Capture**는 macOS/Windows용 데스크톱 앱으로, **화면 캡처 → AI 분석 → Linear 이슈 자동 생성**을 하나의 플로우로 연결하는 도구입니다.

### 2.2 핵심 기능 (Feature Map)

```
┌─────────────────────────────────────────────────────────────────┐
│                    LINEAR CAPTURE v1.2.10                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [1] 화면 캡처          [2] AI 분석           [3] 이슈 생성      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ ⌘+Shift+L    │───▶│ Haiku/Gemini │───▶│ Linear API   │       │
│  │ 영역 선택     │    │ 제목+설명 생성│    │ 이슈 + 이미지 │       │
│  │ 최대 10장     │    │ 프로젝트 추천 │    │ 팀/프로젝트   │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                                  │
│  [4] 컨텍스트 검색 (선택사항)                                     │
│  ┌──────────────────────────────────────────────────────┐       │
│  │ Slack 메시지 │ Notion 페이지 │ Gmail 메일 │ Linear 이슈│       │
│  │    ↓             ↓              ↓            ↓        │       │
│  │         PGlite (벡터검색 + FTS 하이브리드)             │       │
│  │         OpenAI 임베딩 (text-embedding-3-small)         │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  [5] 설정 & 연동                                                 │
│  ┌──────────────────────────────────────────────────────┐       │
│  │ Linear 토큰 │ Slack OAuth │ Gmail OAuth │ Notion 로컬│       │
│  │ OpenAI 키   │ 단축키 설정  │ 언어 설정   │ 자동 업데이트│       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 시스템 아키텍처 (현행 As-Is)

```
┌─ Electron App ──────────────────────────────────────────────────┐
│                                                                  │
│  ┌─ Renderer (HTML/CSS/JS) ──┐   ┌─ Main Process ────────────┐ │
│  │                            │   │                            │ │
│  │ index.html    (3,978줄)   │◀─▶│ ipc-handlers.ts  (857줄)  │ │
│  │ settings.html (2,324줄)   │IPC│ window-manager.ts (124줄)  │ │
│  │ onboarding.html (563줄)   │   │ capture-session.ts (160줄) │ │
│  │                            │   │ state.ts          (67줄)   │ │
│  │ 인라인 JS: ~3,900줄       │   │ hotkey.ts         (204줄)  │ │
│  │ 전역변수: 50+개           │   │ oauth-handlers.ts (134줄)  │ │
│  │ IPC 채널: 40+개           │   │ tray.ts           (87줄)   │ │
│  └────────────────────────────┘   └────────────────────────────┘ │
│                                          │                       │
│  ┌─ Services Layer (~15,000줄, 40+ 파일) ┘                      │
│  │                                                               │
│  │ ┌─ API 클라이언트 ─┐  ┌─ 동기화 어댑터 ─┐  ┌─ AI 분석 ────┐ │
│  │ │ linear-client     │  │ slack-sync       │  │ anthropic     │ │
│  │ │ slack-client      │  │ notion-sync      │  │ gemini        │ │
│  │ │ gmail-client      │  │ linear-sync      │  │ ai-recommend  │ │
│  │ │ notion-client     │  │ gmail-sync       │  └───────────────┘ │
│  │ │ notion-local-reader│ └──────────────────┘                    │
│  │ └──────────────────┘                                          │
│  │                                                               │
│  │ ┌─ 검색 엔진 ──────┐  ┌─ 인프라 ────────┐                   │
│  │ │ local-search      │  │ database (PGlite)│                   │
│  │ │ hybrid-search     │  │ settings-store   │                   │
│  │ │ embedding-service │  │ auto-updater     │                   │
│  │ │ embedding-client  │  │ analytics        │                   │
│  │ │ reranker          │  └──────────────────┘                   │
│  │ │ recency-boost     │                                         │
│  │ └──────────────────┘                                          │
│  └───────────────────────────────────────────────────────────────┘
└────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐   ┌──────────────────┐   ┌──────────────┐
│ Linear API  │   │ Cloudflare Worker │   │ OpenAI API   │
│ (이슈 생성)  │   │ (AI분석, OAuth,   │   │ (임베딩 생성) │
│             │   │  R2 업로드)       │   │              │
└─────────────┘   └──────────────────┘   └──────────────┘
```

---

## 3. 현행 분석 - 데이터 스키마 경계선

### 3.1 데이터 경계 맵 (Data Boundary Map)

Linear Capture의 데이터는 **4개 경계(Boundary)**로 구분됩니다:

```
┌─────────────────────────────────────────────────────────────────┐
│  Boundary 1: 로컬 영구 저장소 (Persistent Local Storage)        │
│  ─────────────────────────────────────────────────────────────  │
│  electron-store (settings-store.ts)                             │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ linearApiToken: string     (Linear API 인증)          │     │
│  │ openaiApiKey: string       (임베딩 생성용)            │     │
│  │ defaultTeamId: string      (기본 팀 ID)               │     │
│  │ userInfo: {id, name, email} (Linear 사용자)           │     │
│  │ captureHotkey: string      (단축키 설정)              │     │
│  │ language: string           (UI 언어)                  │     │
│  │ deviceId: string           (분석용 기기 ID)           │     │
│  │ selectedSlackChannels: [{id, name, selected}]         │     │
│  └───────────────────────────────────────────────────────┘     │
│                                                                 │
│  PGlite Database (database.ts)                                  │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ documents     │ 동기화된 컨텐츠 + 임베딩 (벡터검색)    │     │
│  │ sync_cursors  │ 소스별 동기화 진행 상태                │     │
│  │ sources       │ 연결된 소스 정보                       │     │
│  └───────────────────────────────────────────────────────┘     │
│                                                                 │
│  Notion 로컬 캐시 (notion-local-reader.ts)                      │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ ~/Library/Application Support/Notion/notion.db (읽기전용) │  │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Boundary 2: 런타임 메모리 상태 (In-Memory Runtime State)       │
│  ─────────────────────────────────────────────────────────────  │
│  AppState (state.ts) - 싱글톤                                   │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ 윈도우 참조: mainWindow, settingsWindow, onboarding   │     │
│  │ 캡처 세션: captureSession {images[], analysisResult}  │     │
│  │ Linear 캐시: teams[], projects[], users[], states[],  │     │
│  │              cycles[], labels[]                        │     │
│  │ 서비스 인스턴스: gemini, anthropic, slack, notion,     │     │
│  │                  gmail, capture                        │     │
│  │ OAuth 대기: pendingSlack/Notion/GmailCallback         │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Boundary 3: IPC 통신 계약 (IPC Communication Contract)         │
│  ─────────────────────────────────────────────────────────────  │
│  40+ 채널, 타입 정의 없음 (any 기반)                            │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ Renderer → Main (invoke):                              │     │
│  │   create-issue, get-teams, get-projects, get-settings, │     │
│  │   reanalyze, slack-search, context.getRelated, etc.    │     │
│  │                                                        │     │
│  │ Main → Renderer (send):                                │     │
│  │   capture-ready, ai-analysis-ready, language-changed,  │     │
│  │   settings-updated, linear-data-updated, etc.          │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Boundary 4: 외부 API 인터페이스 (External API Interface)       │
│  ─────────────────────────────────────────────────────────────  │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ Linear GraphQL  │ 이슈 CRUD, 팀/프로젝트/사용자 조회   │     │
│  │ Slack Web API   │ 메시지 검색, 채널 목록 (OAuth)        │     │
│  │ Gmail API       │ 메일 검색, 스레드 조회 (OAuth)        │     │
│  │ Notion API      │ 페이지 검색, 콘텐츠 조회 (OAuth)      │     │
│  │ OpenAI API      │ 텍스트 임베딩 생성 (직접 호출)        │     │
│  │ CF Worker       │ AI 분석, R2 업로드, OAuth 프록시       │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 타입 중복/불일치 현황

| 타입명 | 위치 1 | 위치 2 | 문제 |
|--------|--------|--------|------|
| `UserInfo` | settings-store.ts `{id, name, email}` | linear-client.ts `{id, name, email, avatarUrl?}` | 스키마 불일치 |
| `AnalysisResult` | gemini-analyzer.ts | anthropic-analyzer.ts | 동일 정의 중복 |
| `SyncResult` | slack-sync.ts | notion-sync.ts, linear-sync.ts, gmail-sync.ts | 각각 별도 정의 |
| `UploadResult` | linear-uploader.ts | r2-uploader.ts | 동일 정의 중복 |
| `SearchResult` | context-search.ts | hybrid-search.ts | extends 관계지만 혼재 |

### 3.3 `any` 사용 및 타입 안전성 결함

| 위치 | 코드 | 위험도 |
|------|------|--------|
| linear-sync.ts:81 | `(this.linearService as any).client` | HIGH |
| ipc-handlers.ts 전체 | IPC 채널 payload 타입 없음 | HIGH |
| state.ts | `getStore()` 반환 타입 미정의 | MEDIUM |
| database.ts:12 | `@ts-ignore` 벡터 확장 | LOW |
| renderer 전역변수 | JavaScript (타입 없음) | HIGH |

---

## 4. 핵심 문제 진단 (Critical Issues)

### 이번 스프린트에서 해결할 문제 (Phase 1-3)

```
🟠 HIGH - 이번 스프린트 대상
━━━━━━━━━━━━━━━━━━━━━━━━━━━
H1. IPC 타입 계약 부재: 40+ 채널에 타입 정의 없음     → Phase 1
H2. ipc-handlers.ts 857줄 갓 파일                     → Phase 3
H3. AppState 갓 오브젝트                               → Phase 3
H4. 타입 중복 5건 이상                                 → Phase 1

🟡 MEDIUM - 이번 스프린트 대상
━━━━━━━━━━━━━━━━━━━━━━━━━━━
M1. OAuth 핸들러 코드 중복 (3벌 복붙)                   → Phase 3
M2. 임베딩 서비스 이중 구현                             → Phase 2
M3. Slack 채널 필터링 3회 중복                          → Phase 2
L1. 하드코딩된 매직 넘버                                → Phase 2
```

### 후순위 (다음 스프린트)

```
🔴 CRITICAL - 다음 스프린트
━━━━━━━━━━━━━━━━━━━━━━━━━━━
C1. Electron 보안: contextIsolation: false             → 별도 Phase (Preload 전환)
C2. 렌더러 모놀리스: index.html 인라인 JS 2,600줄      → 별도 Phase (렌더러 모듈화)

미룬 이유:
- C1은 Preload 전환 시 렌더러의 모든 IPC 호출을 수정해야 함 (범위 과대)
- C2는 C1 완료 후에야 의미 있음 (window.api 전환 선행 필요)
- 이번 3개 Phase로 기반을 다진 후 진행하면 훨씬 안전
```

---

## 5. 리팩토링 로드맵 (3 Phase, 직렬 실행)

### 전체 타임라인

```
Phase 1: 타입 시스템 기반 ──────── 1-2일
    │
    ▼
Phase 2: 서비스 레이어 퀵윈 ───── 0.5일
    │
    ▼
Phase 3: IPC 분할 + 상태 분리 ── 2일
                                ──────
                                총 3.5-4.5일
```

---

### Phase 1: 타입 시스템 기반 구축

**목표**: 중복 타입 통합 + IPC 채널 타입 계약으로 안전한 리팩토링 기반 마련
**해결**: H1(IPC 타입 없음), H4(타입 5건 중복)
**위험도**: 낮음 (새 파일 추가 + import 경로 변경만, 기존 로직 변경 없음)

#### Plan (계획)

```
src/types/ (신규 디렉토리)
├── shared.ts          # 공유 타입 (AnalysisResult, SyncResult, UploadResult)
├── linear.ts          # Linear 도메인 (TeamInfo, ProjectInfo, UserInfo 등)
├── search.ts          # 검색 도메인 (SearchResult, HybridSearchOptions)
├── sync.ts            # 동기화 도메인 (SyncProgress, SyncCursor)
├── ipc-channels.ts    # ★ IPC 채널 계약 (채널명 + payload 타입)
├── settings.ts        # 설정 스키마 (Settings, SlackChannelInfo)
├── capture.ts         # 캡처 도메인 (CapturedImage, CaptureSession)
└── index.ts           # 배럴 익스포트
```

#### Do (실행) - 에이전트 병렬 전략

```
┌─────────────────────────────────────────────────────────────┐
│ Agent A (Data Architect)         Agent B (Backend Lead)     │
│                                                             │
│ 1. shared.ts 생성                1. ipc-channels.ts 생성    │
│    - AnalysisResult                 - 40+ 채널 전체 정의    │
│    - SyncResult                     - IpcChannelMap 인터페이스│
│    - UploadResult                   - IpcParams/IpcResult   │
│                                     타입 헬퍼               │
│ 2. linear.ts 생성                                           │
│    - TeamInfo, ProjectInfo       2. settings.ts 생성        │
│    - UserInfo (통합 버전)           - Settings 인터페이스     │
│    - WorkflowStateInfo              - SlackChannelInfo      │
│    - CycleInfo, LabelInfo                                   │
│                                                             │
│ 3. search.ts + sync.ts 생성                                 │
│ 4. capture.ts 생성                                          │
│ 5. index.ts (배럴 익스포트)                                  │
├─────────────────────────────────────────────────────────────┤
│              합류: 기존 파일 import 경로 변경                  │
├─────────────────────────────────────────────────────────────┤
│ Agent C (QA Validator)                                      │
│ - npx tsc --noEmit                                          │
│ - grep 중복 타입 확인                                        │
│ - npx vitest run                                            │
└─────────────────────────────────────────────────────────────┘
```

**1.1 공유 타입 통합** (Agent A)

```typescript
// src/types/shared.ts - 5건 중복 → 단일 소스
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

export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  itemsFailed: number;
  errors: string[];
  lastCursor?: string;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface MultiUploadResult {
  success: boolean;
  urls: string[];
  errors: string[];
}
```

**1.2 IPC 타입 계약** (Agent B)

```typescript
// src/types/ipc-channels.ts
import type { TeamInfo, ProjectInfo, UserInfo, WorkflowStateInfo, CycleInfo, LabelInfo } from './linear';
import type { CreateIssueParams, CreateIssueResult } from './linear';
import type { AnalysisResult } from './shared';
import type { Settings } from './settings';
import type { SearchResult } from './search';

export interface IpcInvokeChannelMap {
  // Linear 데이터
  'get-teams': { params: void; result: TeamInfo[] };
  'get-projects': { params: void; result: ProjectInfo[] };
  'get-users': { params: void; result: UserInfo[] };
  'get-states': { params: void; result: WorkflowStateInfo[] };
  'get-cycles': { params: void; result: CycleInfo[] };
  'get-labels': { params: void; result: LabelInfo[] };
  'create-issue': { params: CreateIssueParams; result: CreateIssueResult };
  'reload-linear-data': { params: void; result: void };

  // 캡처 + AI
  'add-capture': { params: void; result: { success: boolean } };
  'remove-capture': { params: { index: number }; result: void };
  'reanalyze': { params: { images: string[]; model: string; hint?: string }; result: AnalysisResult };

  // 설정
  'get-settings': { params: void; result: Settings };
  'save-settings': { params: Partial<Settings>; result: { success: boolean } };
  'validate-token': { params: { token: string }; result: { valid: boolean; userInfo?: any } };
  'get-hotkey': { params: void; result: string };
  'save-hotkey': { params: { shortcut: string }; result: { success: boolean } };
  'reset-hotkey': { params: void; result: { shortcut: string } };
  'set-language': { params: { language: string }; result: void };
  'translate': { params: { key: string; options?: object }; result: string };

  // 검색
  'context.getRelated': { params: { query: string; limit?: number }; result: SearchResult[] };
  'context-semantic-search': { params: { query: string; type?: string }; result: SearchResult[] };

  // 동기화
  'sync:trigger': { params: { source: string }; result: { success: boolean } };
  'sync:get-status': { params: void; result: Record<string, any> };
  'sync:get-slack-channels': { params: void; result: any[] };
  'sync:set-slack-channels': { params: { channels: any[] }; result: void };

  // OAuth
  'slack-connect': { params: void; result: { success: boolean } };
  'slack-disconnect': { params: void; result: { success: boolean } };
  'slack-status': { params: void; result: { connected: boolean; workspace?: string } };
  'notion-connect': { params: void; result: { success: boolean } };
  'notion-disconnect': { params: void; result: { success: boolean } };
  'notion-status': { params: void; result: { connected: boolean; workspace?: string } };
  'gmail-connect': { params: void; result: { success: boolean } };
  'gmail-disconnect': { params: void; result: { success: boolean } };
  'gmail-status': { params: void; result: { connected: boolean; user?: string } };

  // 윈도우
  'close-window': { params: void; result: void };
  'close-settings': { params: void; result: void };
  'open-settings': { params: void; result: void };
  'cancel': { params: void; result: void };

  // 기타
  'check-for-updates': { params: void; result: void };
  'get-app-version': { params: void; result: string };
  'get-device-id': { params: void; result: string };
}

// Main → Renderer 이벤트
export interface IpcEventChannelMap {
  'capture-ready': { images: string[]; analysis?: AnalysisResult };
  'capture-added': { filePath: string; index: number };
  'capture-removed': { index: number };
  'ai-analysis-ready': AnalysisResult;
  'language-changed': { language: string };
  'settings-updated': void;
  'linear-data-updated': void;
  'hotkey-changed': { shortcut: string };
  'slack-connected': void;
  'notion-connected': void;
  'gmail-connected': void;
}

// 타입 헬퍼
export type IpcInvokeChannel = keyof IpcInvokeChannelMap;
export type IpcParams<C extends IpcInvokeChannel> = IpcInvokeChannelMap[C]['params'];
export type IpcResult<C extends IpcInvokeChannel> = IpcInvokeChannelMap[C]['result'];
```

**1.3 기존 파일 import 경로 변경** (Agent A + B 합류)

| 기존 파일 | 변경 내용 |
|----------|----------|
| gemini-analyzer.ts | `AnalysisResult` 로컬 정의 삭제 → `import from '../types'` |
| anthropic-analyzer.ts | `AnalysisResult` 로컬 정의 삭제 → `import from '../types'` |
| slack-sync.ts | `SyncResult` 로컬 정의 삭제 → `import from '../../types'` |
| notion-sync.ts | `SyncResult` 로컬 정의 삭제 → `import from '../../types'` |
| linear-sync.ts | `SyncResult` 로컬 정의 삭제 → `import from '../../types'` |
| gmail-sync.ts | `SyncResult` 로컬 정의 삭제 → `import from '../../types'` |
| linear-uploader.ts | `UploadResult` 로컬 정의 삭제 → `import from '../types'` |
| r2-uploader.ts | `UploadResult` 로컬 정의 삭제 → `import from '../types'` |

#### Check (검증) - Agent C

- [ ] `npx tsc --noEmit` 타입 에러 0건
- [ ] `npx vitest run` 기존 테스트 전체 통과
- [ ] `grep -rn "interface AnalysisResult" src/` → `src/types/shared.ts`만 존재
- [ ] `grep -rn "interface SyncResult" src/` → `src/types/shared.ts`만 존재
- [ ] `grep -rn "interface UploadResult" src/` → `src/types/shared.ts`만 존재
- [ ] 모든 IPC 채널이 `IpcInvokeChannelMap`에 정의됨

#### Act (개선)
- 타입 정의 누락 채널 발견 시 즉시 추가
- `any` 사용 부분 목록화 → Phase 3에서 점진 해소

---

### Phase 2: 서비스 레이어 퀵윈

**목표**: 중복 코드 제거 + 매직 넘버 상수화 (빠르고 안전한 개선)
**해결**: M2(임베딩 중복), M3(Slack 필터 중복), L1(매직 넘버)
**위험도**: 낮음 (파일 삭제 1건 + 유틸 추출 + 상수 파일 추가)

#### Plan (계획)

```
변경 요약:
  삭제: src/services/embedding-service.ts (embedding-client.ts로 통합)
  신규: src/services/constants.ts (매직 넘버 상수화)
  신규: src/services/utils/channel-filter.ts (Slack 채널 필터링 공통화)
  수정: src/services/local-search.ts (필터링 3곳 → 유틸 함수 호출)
  수정: 각 sync-adapter (임베딩 import 경로 변경)
```

#### Do (실행) - 에이전트 병렬 전략

```
┌─────────────────────────────────────────────────────────────┐
│ Agent A                          Agent B                    │
│                                                             │
│ 1. constants.ts 생성             1. embedding-service.ts    │
│    - SEARCH (RRF_K, LIMIT)          사용처 조사             │
│    - SYNC (배치 사이즈)          2. import 경로 변경         │
│    - CAPTURE (MAX_IMAGES)           → embedding-client.ts   │
│    - RECENCY (반감기 설정)       3. embedding-service.ts    │
│                                      파일 삭제              │
│ 2. channel-filter.ts 생성                                   │
│    - buildSlackChannelFilter()                              │
│                                                             │
│ 3. local-search.ts 수정                                     │
│    - 필터링 3곳 → 유틸 호출                                  │
├─────────────────────────────────────────────────────────────┤
│ Agent C (QA Validator)                                      │
│ - npx tsc --noEmit                                          │
│ - grep -r "embedding-service" src/ (0건 확인)               │
│ - npx vitest run                                            │
└─────────────────────────────────────────────────────────────┘
```

**2.1 상수 파일 생성** (Agent A)

```typescript
// src/services/constants.ts
export const SEARCH = {
  RRF_K: 60,
  RETRIEVAL_LIMIT: 100,
  DEFAULT_RESULT_LIMIT: 5,
  MIN_SCORE: 0.1,
} as const;

export const SYNC = {
  LINEAR_BATCH_SIZE: 25,
  EMBEDDING_BATCH_SIZE: 300,
  SYNC_INTERVAL_MS: 5 * 60 * 1000,
} as const;

export const CAPTURE = {
  MAX_IMAGES: 10,
  DEBOUNCE_MS: 50,
} as const;

export const RECENCY = {
  SLACK: { halfLifeDays: 7, weight: 0.6 },
  LINEAR: { halfLifeDays: 14, weight: 0.4 },
  NOTION: { halfLifeDays: 30, weight: 0.2 },
  GMAIL: { halfLifeDays: 14, weight: 0.5 },
} as const;
```

**2.2 Slack 채널 필터링 추출** (Agent A)

```typescript
// src/services/utils/channel-filter.ts
import { getSettings } from '../settings-store';

export function getSelectedSlackChannelIds(): string[] {
  const settings = getSettings();
  return (settings.selectedSlackChannels || [])
    .filter(ch => ch.selected)
    .map(ch => ch.id);
}

export function buildSlackChannelCondition(
  paramOffset: number = 0
): { sql: string; params: string[] } | null {
  const channelIds = getSelectedSlackChannelIds();
  if (channelIds.length === 0) return null;

  const placeholders = channelIds.map((_, i) => `$${paramOffset + i + 1}`);
  return {
    sql: `metadata->>'channelId' IN (${placeholders.join(',')})`,
    params: channelIds,
  };
}
```

**2.3 임베딩 서비스 통합** (Agent B)

```
Before: 2개 파일이 동일 기능 제공
  embedding-service.ts  → 직접 OpenAI API 호출
  embedding-client.ts   → Worker 기반 (권장)

After: embedding-client.ts만 유지
  1. embedding-service.ts를 import하는 파일 조사
  2. 모두 embedding-client.ts로 변경
  3. embedding-service.ts 삭제
```

#### Check (검증) - Agent C

- [ ] `npx tsc --noEmit` 에러 0건
- [ ] `npx vitest run` 전체 통과
- [ ] `grep -r "embedding-service" src/` → 0건
- [ ] `grep -r "= 60" src/services/` → constants.ts에만 존재
- [ ] local-search.ts에서 채널 필터링 중복 코드 0건

#### Act (개선)
- 상수값 튜닝 기회 기록 (RRF_K 최적값, recency weights)
- 추가 매직 넘버 발견 시 constants.ts에 추가

---

### Phase 3: IPC 분할 + 상태 분리

**목표**: 857줄 갓 파일을 도메인별로 분할, AppState를 역할별로 분리
**해결**: H2(갓 파일), H3(갓 오브젝트), M1(OAuth 중복)
**위험도**: 중간 (파일 구조 변경이지만 로직 변경 없음)

#### Plan (계획)

```
src/main/ (리팩토링 후)
├── index.ts                    # 앱 라이프사이클만 (간소화)
├── window-manager.ts           # (변경 없음)
├── capture-session.ts          # (변경 없음)
├── hotkey.ts                   # (변경 없음)
├── tray.ts                     # (변경 없음)
├── i18n.ts                     # (변경 없음)
│
├── ipc/                        # (신규) 857줄 → 7개 파일
│   ├── index.ts                # 핸들러 등록 오케스트레이터
│   ├── linear-handlers.ts      # Linear 데이터 + 이슈 생성 (~200줄)
│   ├── capture-handlers.ts     # 캡처 + AI 분석 (~100줄)
│   ├── settings-handlers.ts    # 설정 관리 (~150줄)
│   ├── search-handlers.ts      # 컨텍스트 검색 (~180줄)
│   ├── sync-handlers.ts        # 동기화 (~100줄)
│   ├── oauth-handlers.ts       # OAuth 3서비스 통합 (~80줄)
│   └── window-handlers.ts      # 윈도우 관리 (~50줄)
│
├── state/                      # (신규) 67줄 갓 오브젝트 → 역할별 분리
│   ├── index.ts                # getState() 하위 호환 유지
│   ├── window-state.ts         # 윈도우 참조만
│   ├── linear-cache.ts         # Linear 데이터 캐시만
│   ├── service-registry.ts     # 서비스 인스턴스 관리만
│   └── session-state.ts        # 캡처 세션 + OAuth 대기
│
└── (삭제) ipc-handlers.ts      # → ipc/ 디렉토리로 대체
└── (삭제) state.ts             # → state/ 디렉토리로 대체
└── (이동) oauth-handlers.ts    # → ipc/oauth-handlers.ts로 통합
```

#### Do (실행) - 에이전트 병렬 전략

```
┌─────────────────────────────────────────────────────────────────┐
│ Agent A (상태 분리)              Agent B (IPC 분할)              │
│                                                                 │
│ 1. state/window-state.ts 생성   1. ipc/linear-handlers.ts 추출 │
│ 2. state/linear-cache.ts 생성      - get-teams ~ get-labels     │
│ 3. state/service-registry.ts       - create-issue               │
│ 4. state/session-state.ts          - reload-linear-data         │
│ 5. state/index.ts                                               │
│    (기존 getState() 호환 유지)  2. ipc/capture-handlers.ts 추출 │
│                                    - add-capture, remove-capture │
│                                    - reanalyze                   │
│                                                                 │
│                                 3. ipc/settings-handlers.ts 추출│
│                                    - get/save-settings           │
│                                    - hotkey, language, token     │
│                                                                 │
│                                 4. ipc/search-handlers.ts 추출  │
│                                    - context.getRelated          │
│                                    - context-semantic-search     │
│                                                                 │
│                                 5. ipc/sync-handlers.ts 추출    │
│                                 6. ipc/oauth-handlers.ts        │
│                                    (팩토리 패턴으로 3벌 통합)     │
│                                 7. ipc/window-handlers.ts 추출  │
│                                 8. ipc/index.ts (등록 오케스트레이터) │
├─────────────────────────────────────────────────────────────────┤
│              합류: index.ts에서 import 경로 변경                  │
│              기존 ipc-handlers.ts / state.ts 삭제                │
├─────────────────────────────────────────────────────────────────┤
│ Agent C (QA Validator)                                          │
│ - npx tsc --noEmit                                              │
│ - npm run pack:clean (앱 실행 테스트)                            │
│ - 전체 IPC 채널 동작 확인                                        │
└─────────────────────────────────────────────────────────────────┘
```

**3.1 OAuth 핸들러 팩토리 패턴** (Agent B)

```typescript
// src/main/ipc/oauth-handlers.ts
// Before: Slack 52줄 + Notion 42줄 + Gmail 31줄 = 125줄 (거의 동일)
// After: 팩토리 함수 ~80줄

type OAuthProvider = 'slack' | 'notion' | 'gmail';

function getServiceByProvider(provider: OAuthProvider) {
  const state = getState();
  switch (provider) {
    case 'slack': return state.slackService;
    case 'notion': return state.notionService;
    case 'gmail': return state.gmailService;
  }
}

function registerOAuthHandlers(provider: OAuthProvider) {
  ipcMain.handle(`${provider}-connect`, async () => {
    const service = getServiceByProvider(provider);
    if (!service) return { success: false, error: `${provider} not initialized` };
    return service.startOAuthFlow();
  });

  ipcMain.handle(`${provider}-disconnect`, async () => {
    const service = getServiceByProvider(provider);
    if (!service) return { success: false, error: `${provider} not initialized` };
    return service.disconnect();
  });

  ipcMain.handle(`${provider}-status`, async () => {
    const service = getServiceByProvider(provider);
    if (!service) return { connected: false };
    return service.getConnectionStatus();
  });
}

export function registerAllOAuthHandlers() {
  (['slack', 'notion', 'gmail'] as OAuthProvider[]).forEach(registerOAuthHandlers);
}
```

**3.2 AppState 분리** (Agent A)

```typescript
// src/main/state/index.ts
// 기존 코드와 하위 호환 유지

import { WindowState } from './window-state';
import { LinearCache } from './linear-cache';
import { ServiceRegistry } from './service-registry';
import { SessionState } from './session-state';

class AppState {
  readonly windows = new WindowState();
  readonly linearCache = new LinearCache();
  readonly services = new ServiceRegistry();
  readonly session = new SessionState();

  // 하위 호환: 기존 state.mainWindow 접근 유지
  get mainWindow() { return this.windows.mainWindow; }
  set mainWindow(w) { this.windows.mainWindow = w; }
  get settingsWindow() { return this.windows.settingsWindow; }
  set settingsWindow(w) { this.windows.settingsWindow = w; }

  // 기존 캐시 프로퍼티 위임
  get teamsCache() { return this.linearCache.teams; }
  set teamsCache(v) { this.linearCache.teams = v; }
  get projectsCache() { return this.linearCache.projects; }
  set projectsCache(v) { this.linearCache.projects = v; }
  // ... 나머지 캐시도 동일 패턴
}

let instance: AppState | null = null;
export function getState(): AppState {
  if (!instance) instance = new AppState();
  return instance;
}
```

#### Check (검증) - Agent C

- [ ] `npx tsc --noEmit` 에러 0건
- [ ] `npm run pack:clean` 후 앱 정상 실행
- [ ] 캡처 플로우 동작 (⌘+Shift+L → 영역 선택 → 갤러리 표시)
- [ ] AI 분석 동작 ("분석 시작" → 제목+설명 생성)
- [ ] 이슈 생성 동작 ("Create Issue" → Linear에 생성)
- [ ] 설정 화면 동작 (토큰 저장, 단축키 변경)
- [ ] OAuth 동작 (Slack/Notion/Gmail 연결)
- [ ] 다국어 동작 (언어 변경)
- [ ] 기존 `ipc-handlers.ts` 파일 삭제 완료
- [ ] 기존 `state.ts` 파일 삭제 완료
- [ ] 신규 파일 각각 200줄 이하
- [ ] 순환 의존성 없음

#### Act (개선)
- 분할 과정에서 발견된 숨은 의존성 기록
- 다음 스프린트 (Preload 전환) 시 ipc/ 구조가 preload.ts 생성에 유리한지 평가

---

## 6. 리팩토링 전후 비교 (예상)

### 이번 스프린트 목표 메트릭

| 지표 | Before (현행) | After (Phase 3 완료) | 개선 |
|------|:------------:|:-------------------:|:----:|
| ipc-handlers.ts | 857줄 (단일 파일) | 7개 파일 × ~120줄 | -86% per file |
| state.ts | 갓 오브젝트 (모든 것 포함) | 4개 역할별 모듈 | SRP 달성 |
| 타입 중복 | 5건 | 0건 | -100% |
| IPC 타입 정의 | 0% | 100% (40+ 채널) | +100% |
| 매직 넘버 | 코드 곳곳에 산재 | constants.ts에 집중 | 단일 소스 |
| 임베딩 구현 | 2개 (중복) | 1개 | -50% |
| Slack 필터 중복 | 3곳 | 1곳 (유틸 함수) | -67% |
| OAuth 핸들러 | 3벌 복붙 | 1개 팩토리 | -67% |

### 아키텍처 품질

| 원칙 | Before | After |
|------|--------|-------|
| 단일 책임 (SRP) | AppState 갓 오브젝트, ipc-handlers 갓 파일 | 도메인별 분리 |
| 개방-폐쇄 (OCP) | OAuth 핸들러 3벌 복붙 | 팩토리 패턴으로 확장 가능 |
| DRY | Slack 필터링 3회, 타입 5건, 임베딩 2건 중복 | 유틸 추출, 타입 통합 |

### 건드리지 않는 것 (다음 스프린트)

| 항목 | 현행 유지 | 다음 스프린트에서 개선 |
|------|----------|---------------------|
| contextIsolation | false (유지) | Preload 전환 Phase |
| index.html 인라인 JS | 2,600줄 (유지) | 렌더러 모듈화 Phase |
| settings.html 인라인 JS | 1,100줄 (유지) | 렌더러 모듈화 Phase |
| 렌더러 전역변수 | 50+개 (유지) | 렌더러 모듈화 Phase |

---

## 7. 리스크 & 완화 전략

| 리스크 | 확률 | 영향 | 완화 전략 |
|--------|:----:|:----:|----------|
| Phase 1 타입 변경 후 빌드 실패 | 중간 | 낮음 | 로직 변경 없음, import 경로만 변경 |
| Phase 2 임베딩 서비스 삭제 후 누락 | 낮음 | 중간 | `grep -r "embedding-service"` 로 사전 확인 |
| Phase 3 IPC 분할 시 핸들러 누락 | 중간 | 높음 | Phase 1의 IpcChannelMap으로 컴파일 시 검출 |
| Phase 3 상태 분리 시 기존 참조 깨짐 | 중간 | 중간 | 하위 호환 getter/setter 유지 |
| pack:clean 후 기능 회귀 | 낮음 | 높음 | 매 Phase 후 수동 E2E 체크리스트 |

---

## 8. 실행 원칙

1. **Phase 단위 커밋**: 각 Phase 완료 시 독립 커밋 (revert 가능)
2. **매 Phase 후 pack:clean**: 기능 회귀 즉시 감지
3. **타입 먼저**: 코드 변경 전 타입 계약 선행 (Phase 1이 기반)
4. **하위 호환 유지**: state 분리 시 기존 API 깨지지 않도록 위임 패턴
5. **에이전트 병렬**: Phase 내 독립 작업은 Agent A/B 동시 실행, Agent C가 최종 검증

---

## 9. 다음 스프린트 예고 (이번 완료 후)

이번 3개 Phase가 완료되면 다음 우선순위:

| 순서 | Phase | 전제 조건 |
|:----:|-------|----------|
| 4 | Electron 보안 (Preload 전환) | Phase 3의 ipc/ 구조 활용 |
| 5 | 렌더러 모듈화 | Phase 4의 Preload 완료 후 |
| 6 | 테스트 구축 | Phase 1-5 안정화 후 |

---

## 부록: 타입 정의 전체 목록 (85+ 타입)

**이번 스프린트에서 통합되는 타입**:
- `AnalysisResult` (×2 중복 → 1개)
- `SyncResult` (×4 중복 → 1개)
- `UploadResult` (×2 중복 → 1개)
- `MultiUploadResult` (×2 중복 → 1개)
- `UserInfo` (×2 불일치 → 1개 + settings용 별칭)

**새로 생성되는 타입**:
- `IpcInvokeChannelMap` (40+ 채널 계약)
- `IpcEventChannelMap` (10+ 이벤트 계약)
- `IpcParams<C>`, `IpcResult<C>` (타입 헬퍼)

**그대로 유지되는 타입** (이미 단일 정의):
- Linear: TeamInfo, ProjectInfo, WorkflowStateInfo, CycleInfo, LabelInfo
- Search: HybridSearchOptions, VectorDocument, VectorItem
- Slack: SlackConnectionStatus, SlackChannel, SlackMessage
- Notion: NotionPage, NotionSearchResult, LocalNotionPage
- Gmail: GmailMessage, GmailSearchResult
- Capture: CapturedImage, CaptureSession, CaptureResult, PermissionStatus
