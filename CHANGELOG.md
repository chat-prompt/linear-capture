# Changelog

All notable changes to Linear Capture will be documented in this file.

## [1.2.10] - 2026-02-03

### Added
- **Related Context Search**: Slack/Notion/Gmail/Linear에서 관련 컨텍스트 자동 검색
  - Slack 사용자 멘션 해석 기능
  - Gmail, Notion 어댑터 추가
  - Manual search 탭 추가 (PR #13)
- **Cohere Reranker + Recency Boost**: 검색 정확도 50%+ 향상
  - Cross-encoder 기반 재정렬
  - 소스별 차등 시간 감쇠 (Slack 7일, Notion 30일 반감기)

### Changed
- Worker 기반 임베딩으로 전환 (사용자 OpenAI API 키 불필요)
- Linear SDK `fileUpload`로 이미지 업로드 방식 변경 (R2 대체)

### Fixed
- **Gmail Sync 806-bug**: 3가지 동기화 버그 수정 (nextPageToken, RFC 2822 날짜 비교, 배치 종료 조건)
- Settings 페이지 Notion 연동 시 프리즈 현상 수정
- Sync 버튼 클릭 시 IPC 지연 제거
- Slack 연결 해제/재연결 시 동기화 캐시 무효화

### Technical
- **Phase 1-6 대규모 리팩토링** (21,265줄 → ~9,500줄, -55%)
  - Phase 1: 레거시 sql.js 검색 스택 제거 (2,786줄 삭제)
  - Phase 2: BaseSyncAdapter, AI Analyzer 통합, config.ts 생성
  - Phase 3: HTML 모놀리스 분리 + esbuild 번들러 도입
  - Phase 4: 타입 안전성 강화 (IPC 채널 등록)
  - Phase 5: 에러 핸들링 22% → 81%
  - Phase 6: contextIsolation + preload 보안 강화

---

## [1.2.8] - 2026-01-27

### Added
- **User Hint**: 이슈 작성 시 사용자 지시사항(hint) 입력 기능
  - AI 분석에 사용자 의도 전달
  - IPC 핸들러 연동

---

## [1.2.7] - 2026-01-25

### Added
- 캡처 중 메인 윈도우 유지 (화면에 표시 상태 유지)

### Fixed
- v1.1.x → v1.2.x 업그레이드용 클린 설치 스크립트 추가

---

## [1.2.6] - 2026-01-20

### Fixed
- 업데이트 재시작 시 메인 윈도우 중복 생성 방지
- GitHub Releases 파일명 공백→`.` 치환 이슈 대응

---

## [1.2.5] - 2026-01-20

### Changed
- 첫 실행 시 Linear API 토큰 설정 강제화 (온보딩 개선)

---

## [1.2.4] - 2026-01-20

### Added
- **Apple Developer 코드 서명 및 공증** (Geniefy Inc.)

### Changed
- 동적 단축키 힌트 표시
- Settings 모달 크기 확대

---

## [1.2.3] - 2026-01-19

### Added
- **Label 지원**: 이슈에 라벨 추가 기능
- **커스텀 단축키**: 글로벌 단축키 사용자 설정

---

## [1.2.2] - 2026-01-19

### Changed
- 앱 시작 시 메인 윈도우 표시 + 캡처 가이드

---

## [1.2.1] - 2026-01-19

### Fixed
- Worker 경유 R2 업로드로 전환
- 업데이트 체크 다이얼로그 중복 표시 수정

---

## [1.2.0] - 2026-01-19

### Added
- **Cloudflare Worker AI 분석**: API 키 보안 강화
  - 클라이언트에서 직접 API 호출 대신 Worker 프록시 방식

---

## [1.1.3] - 2026-01-19

### Added
- 업데이트 재시작 시 TCC 권한 경고 표시

---

## [1.1.2] - 2026-01-19

### Added
- **자동 업데이트**: electron-updater 연동
- 이미지 모달 열 때 macOS Traffic lights 숨김
- 다중 이미지 캡처 버그 수정 및 UX 개선
- 클린 재설치 스크립트

### Fixed
- GitHub Actions CI 권한 설정 (`contents:write`)

---

## [1.1.1] - 2025-01-15

### Fixed
- **AI Title Generation**: 사내 협업 캡처 시 불필요한 `[외부문의]` 접두어 문제 해결
  - 슬랙, Teams 등 사내 메신저 UI 감지 로직 추가
  - 사내 협업: 접두어 없이 "요청 내용만" 생성
  - 외부 문의: `[회사명] 요청 내용` 형식 유지
  - 불확실한 경우 과도한 분류 방지 (내용만 작성)

### Technical
- Gemini 프롬프트 개선 (프롬프트만 수정, DMG 안정성 유지)
- 사내 업무 용어 감지 강화 ("팀", "프로젝트", "회의", "공유", "검토" 등)

---

## [1.1.0] - 2025-01-14

### Added
- **Settings UI**: 개인 Linear API 토큰 설정 기능
  - 메인 UI에 Settings 버튼 추가 (우측 상단 톱니바퀴)
  - Tray 메뉴에 Settings 항목 추가
  - 토큰 검증 및 저장 (electron-store)
  - 기존 `.env` fallback 지원

### Improved
- **Tray Icon**: 메뉴바 아이콘 시각적 개선
  - 16x16, 32x32 L 모양 아이콘 생성
  - Light/Dark 모드 자동 대응 (Template Image)
  - DMG 패키징 시 assets 포함

### Fixed
- Settings 윈도우 열기/닫기 안정성 개선
- 권한 프롬프트 UX 개선

---

## [1.0.0] - 2025-01-10

### Initial Release
- **Core Features**:
  - macOS 화면 캡처 (⌘+Shift+L 글로벌 단축키)
  - Cloudflare R2 자동 업로드
  - AI 분석 (Anthropic Haiku 4.5 / Gemini 3 Flash)
  - Linear 이슈 자동 생성

- **AI Analysis**:
  - 스크린샷 내용 분석하여 제목/설명 자동 생성
  - 프로젝트/담당자/우선순위/포인트 자동 추천
  - 병렬 처리 (R2 업로드 + AI 분석 동시 실행)

- **UI Features**:
  - 이슈 생성 폼 (Team, Project, Status, Priority, Assignee, Estimate, Cycle 선택)
  - 이슈 URL 클립보드 자동 복사
  - macOS 알림

- **Technical**:
  - Electron + TypeScript
  - DMG 패키징 (Universal binary)
  - Ad-hoc 서명 (Apple Developer 인증서 불필요)

---

## Release Notes Format

**Version format**: `MAJOR.MINOR.PATCH`
- MAJOR: 호환성 깨지는 변경
- MINOR: 기능 추가 (하위 호환)
- PATCH: 버그 수정

**Categories**:
- `Added`: 새로운 기능
- `Changed`: 기존 기능 변경
- `Deprecated`: 곧 제거될 기능
- `Removed`: 제거된 기능
- `Fixed`: 버그 수정
- `Security`: 보안 관련 수정
- `Technical`: 기술적 개선 (사용자에게 보이지 않음)
