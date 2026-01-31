# i18n 완전 자동화 계획

## TL;DR

> **Quick Summary**: 수동 `data-i18n` 속성 방식 → 역방향 맵 기반 자동 번역으로 전환
> 
> **Deliverables**:
> - 역방향 맵 IPC 핸들러 (main/index.ts)
> - autoTranslate() 함수 (3개 HTML 파일)
> - 하드코딩 한글 → 영어 변환
> 
> **Estimated Effort**: Short (~35분)

---

## Context

### 문제점
현재 i18n 구현은 각 HTML 요소에 `data-i18n` 속성을 수동으로 추가해야 함.
새 텍스트 추가 시 속성 누락 가능, 하드코딩 한글 잔존, 유지보수 비효율.

### 해결 방향
영어 텍스트 → 번역 키 역방향 맵 생성하여 DOM 텍스트 자동 번역

---

## 현황 분석

| 파일 | data-i18n 수 | 하드코딩 한글 |
|------|-------------|--------------|
| index.html | 49개 | 8개 |
| settings.html | 36개 | 1개 (유지) |
| onboarding.html | 18개 | 0개 |

---

## TODOs

### 1. 역방향 맵 IPC 핸들러 추가

**파일**: `src/main/index.ts`

```typescript
ipcMain.handle('get-reverse-translation-map', () => {
  const translations = i18next.getResourceBundle('en', 'translation');
  const reverseMap: Record<string, string> = {};
  
  function flatten(obj: any, prefix = '') {
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object') {
        flatten(obj[key], fullKey);
      } else {
        reverseMap[obj[key]] = fullKey;
      }
    }
  }
  flatten(translations);
  return reverseMap;
});
```

---

### 2. autoTranslate() 함수 구현

**파일**: index.html, settings.html, onboarding.html

```javascript
async function autoTranslate() {
  const reverseMap = await ipcRenderer.invoke('get-reverse-translation-map');
  
  const walker = document.createTreeWalker(
    document.body, NodeFilter.SHOW_TEXT, null, false
  );
  
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent.trim();
    if (text && reverseMap[text]) {
      node.textContent = await t(reverseMap[text]);
    }
  }
  
  for (const el of document.querySelectorAll('[placeholder]')) {
    if (reverseMap[el.placeholder]) {
      el.placeholder = await t(reverseMap[el.placeholder]);
    }
  }
}

document.addEventListener('DOMContentLoaded', autoTranslate);
ipcRenderer.on('language-changed', autoTranslate);
```

---

### 3. 하드코딩 한글 → 영어 변환

| 현재 | 변경 |
|------|------|
| >검색< | >Search< |
| >검색 중...< | >Searching...< |
| >검색 결과가 없습니다< | >No results found< |
| >이슈가 생성되었습니다!< | >Issue created!< |
| >닫기< | >Close< |

---

## 주의사항

1. **동일 텍스트 충돌**: 같은 영어가 다른 의미면 구분 불가
2. **동적 텍스트**: JS 생성 텍스트는 t() 직접 호출 필요
3. **변수 텍스트**: {{count}} 등 포함 시 역방향 매핑 불가

---

## 테스트

```bash
npm run build && npm run pack
open 'release/mac-arm64/Linear Capture.app'
# Settings → Language 변경하며 확인
```
