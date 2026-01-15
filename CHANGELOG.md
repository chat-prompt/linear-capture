# Changelog

All notable changes to Linear Capture will be documented in this file.

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
