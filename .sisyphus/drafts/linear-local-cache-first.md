# Draft: Linear 로컬 캐시 우선 조회 패턴

## Requirements (confirmed)
- **대상**: linear-capture Electron 앱
- **패턴**: 로컬 캐시 → API 폴백 (노션과 동일)
- **목적**: API 호출 최소화, 빠른 UI 로딩

## 현재 상태

### 데이터 흐름
```
현재: API 호출 (전체) → 로컬 캐시 (recentIssueTitles만 보충)
목표: 로컬 캐시 (먼저) → API 폴백 (부족한 데이터만)
```

### 현재 `loadLinearData()` (ipc-handlers.ts:45-90)
1. Linear API로 6종 데이터 병렬 호출:
   - teams, projects, users, states, cycles, labels
2. 로컬 캐시에서 `recentIssueTitles`만 병합

### Python 스크립트 (export_linear_cache.py)
이미 Linear IndexedDB에서 읽어오는 데이터:
- Projects (id, name, teamId)
- Teams (id, name, key)
- Issues (title, projectId, stateId 등)
- Workflow States (name, type, color, teamId)

**현재 export 형태**: Projects만 JSON 출력

## Technical Decisions

### 1. Python 스크립트 확장
- Teams, Users, Cycles도 export에 추가
- Labels는 IndexedDB에 있는지 확인 필요
- 출력 JSON 구조 확장:
  ```json
  {
    "version": 3,
    "updatedAt": "...",
    "teams": [...],
    "projects": [...],
    "users": [...],
    "cycles": [...],
    "states": [...],
    "labels": [...]
  }
  ```

### 2. TypeScript 로컬 캐시 서비스 확장
- `linear-local-cache.ts` 인터페이스 확장
- 각 데이터 타입별 매핑 함수 추가

### 3. 로컬 캐시 우선 로직
```typescript
async function loadLinearData() {
  // 1. 로컬 캐시 먼저 시도
  const localCache = await loadLocalCache();
  
  if (localCache && isComplete(localCache)) {
    // 로컬 캐시가 충분하면 바로 사용
    applyCache(localCache);
    return;
  }
  
  // 2. 부족한 데이터만 API로 가져오기
  const missingData = getMissingDataTypes(localCache);
  await fetchFromApi(missingData);
}
```

## Research Findings

### Linear IndexedDB 구조 (Python 스크립트에서 확인)
- `is_team_record()`: key, name 필드로 판별
- `is_project_record()`: name, teamIds, statusId, organizationId
- `is_issue_record()`: number, teamId, title
- `is_workflow_state_record()`: name, type, color, teamId

### 데이터 완전성 체크 필요
- Users: IndexedDB에 있는지 확인 필요
- Cycles: IndexedDB에 있는지 확인 필요
- Labels: IndexedDB에 있는지 확인 필요

## Open Questions
- [x] 작업 대상: linear-capture 앱
- [x] 패턴: 로컬 캐시 → API 폴백
- [ ] Users/Cycles/Labels가 Linear IndexedDB에 존재하는가?
- [ ] 로컬 캐시 데이터가 "충분한지" 판단 기준은?

## Scope Boundaries
- INCLUDE: Python 스크립트 확장, TS 로컬 캐시 서비스 확장, loadLinearData 로직 변경
- EXCLUDE: Linear API 호출 로직 자체 변경, 새 UI 추가
