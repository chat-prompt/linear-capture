# Linear Capture 다국어(i18n) 지원

## TL;DR

> **Quick Summary**: Linear Capture 앱에 다국어 지원 추가. 한국어/영어 전환 가능.
> 
> **Deliverables**:
> - `src/i18n/` - 번역 시스템 모듈
> - `src/i18n/locales/ko.json` - 한국어 번역
> - `src/i18n/locales/en.json` - 영어 번역
> - Settings UI 언어 선택 섹션
> 
> **Estimated Effort**: Medium (1-2일)
> **Status**: 계획 단계 - 상세 인터뷰 필요

---

## Context

### Original Request
Linear Capture 앱에 다국어 처리 추가

### Open Questions (인터뷰 필요)
- [ ] 지원 언어: 한국어/영어만? 추후 확장?
- [ ] 번역 범위: 앱 UI 전체? 특정 화면만?
- [ ] 시스템 언어 자동 감지 vs 수동 선택?
- [ ] 이슈 생성 폼의 AI 분석 결과도 번역?
- [ ] 번역 라이브러리 선택: i18next? 직접 구현?

---

## Preliminary Research Needed

### 1. 현재 앱의 텍스트 현황
- renderer/*.html의 모든 하드코딩된 텍스트
- main 프로세스의 알림/다이얼로그 메시지
- 메뉴바 및 시스템 트레이 텍스트

### 2. Electron i18n 패턴 조사
- electron-i18n 또는 i18next-electron
- 또는 간단한 JSON 기반 직접 구현

---

## Next Steps

1. OpenCode에서 인터뷰 진행
2. 현재 텍스트 인벤토리 작성
3. 상세 계획 수립

---

## Notes

이 계획은 초안입니다. 워크트리에서 OpenCode 실행 후 상세 인터뷰를 통해 완성하세요.
